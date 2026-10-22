# Mini Jira

A lightweight issue tracker with a drag-and-drop Kanban board and per-project roles. I built it to practice full-stack work end to end: authentication, relational-style data in MongoDB, server-side authorization, and optimistic UI.

**Live demo:** https://mini-jira-tan.vercel.app (sign in with any GitHub account; you only see projects you create or are added to)

![Dragging a card from To do into In progress](docs/screenshots/drag-and-drop.gif)

| Light | Dark | Phone (375 px) |
|---|---|---|
| ![Board, light theme](docs/screenshots/board.png) | ![Board, dark theme](docs/screenshots/board-dark.png) | ![Board on a phone](docs/screenshots/board-mobile.png) |

---

## Features

| Feature | Status |
|---|---|
| Sign in with GitHub (Auth.js, JWT sessions) | ✅ |
| Projects with short keys (e.g. `MJ` → `MJ-1`, `MJ-2`) | ✅ |
| Issues: create / edit / delete, type, priority, assignee | ✅ |
| Kanban board with drag & drop (To do / In progress / Done), mouse, touch and keyboard | ✅ |
| Per-project roles: **Admin** and **Member** | ✅ |
| Add members by email, change roles, remove members, last-admin guard | ✅ |
| Filters and title search on the board, kept in the URL | ✅ |
| Dark mode (follows the system), responsive down to 375 px | ✅ |
| Demo data script (`npm run seed`) | ✅ |

## Tech stack

- **Framework:** Next.js 16 (App Router, Server Actions, Cache Components, Turbopack), React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **Database:** MongoDB Atlas + Mongoose
- **Auth:** Auth.js v5 (GitHub OAuth, JWT sessions, no database adapter)
- **Drag & drop:** dnd-kit
- **Validation:** Zod
- **Tests:** Vitest
- **Deploy:** Vercel + MongoDB Atlas (free tiers)

## Architecture

```
Browser ──► Next.js (App Router)
              ├─ Server Components  → read data (projects, board)
              ├─ Server Actions     → every write (create/move/delete issue, manage members)
              │     └─ permission check on the server, every time
              ├─ proxy.ts           → first line of defense: signed-out users go to /login
              └─ Auth.js            → GitHub OAuth, session in a signed JWT
                        │
                        ▼
                 MongoDB Atlas (users, projects, issues)
```

Writes go through Server Actions, not public REST endpoints. Each action loads the caller's membership and checks the role **on the server** before touching the database. Hiding a button in the UI is only for UX, not for security. Every action input is validated with Zod; client-sent ids are always looked up *inside* the caller's project.

## Data model

```ts
User    { name, email (unique), image, createdAt, updatedAt }

Project { name, key (unique, 2–6 uppercase letters), ownerId,
          members: [{ userId, role: "admin" | "member" }],
          issueCounter, createdAt, updatedAt }

Issue   { projectId, number, title, description,
          status: "todo" | "in_progress" | "done",
          priority: "low" | "medium" | "high",
          type: "task" | "bug",
          assigneeId?, reporterId, order, createdAt, updatedAt }
```

**Indexes**
- `Project.members.userId` lists the projects a user belongs to
- `Issue { projectId, number }` is unique, so the same project never has two `MJ-12`
- `Issue { projectId, status, order }` loads the board grouped by column, already sorted

## Permissions

| Action | Admin | Member |
|---|:---:|:---:|
| View board, create / edit issues, move cards | ✅ | ✅ |
| Delete issues | ✅ | ❌ |
| Add / remove members, change roles | ✅ | ❌ |
| Rename / delete project | ✅ | ❌ |

A project must always have at least one admin. The last admin cannot be demoted or removed. People who are not in a project get a 404 for it, so the page does not reveal that the project exists.

## Design decisions

- **Roles live on the project, not on the user.** The same person can be an admin in one project and a member in another.
- **Issue numbers come from an atomic counter.** Creating an issue runs `$inc` on `Project.issueCounter` and uses the returned value. Numbers are never reused after a delete. The unique index catches anything that slips through.
- **Card order is a float, computed on the server.** A card dropped between two others gets the midpoint of their `order` values, so a move updates **one** document instead of renumbering the column. The client only says which two cards it landed between; the server reads their current values. When the gap gets below 0.001 (after about 20 drops into the same spot), the column is renumbered once in a single `bulkWrite`.
- **The last-admin guard lives inside the database update.** Demoting or removing an admin only matches while another admin exists (`$elemMatch` in the filter of the same `updateOne`), so two admins demoting each other at the same moment cannot leave a project without an admin.
- **Optimistic board.** `useOptimistic` shows the move instantly; if the action fails, the card snaps back and a toast explains why.
- **Touch dragging uses a handle.** The cards are links inside a sideways-scrolling board, so a finger drags by the handle (`touch-action: none`) and a swipe anywhere else scrolls. Mouse and keyboard grab the whole card.
- **Filters live in the URL** (`?assignee=me&type=bug&q=login`), parsed with Zod on the server, so a refresh or a shared link shows the same board.
- **Cached DB connection.** In dev, Next.js re-evaluates modules on every save. The Mongoose connection is cached on `globalThis` so it doesn't open a new connection each time and use up Atlas's connection limit.
- **No passwords stored.** Sign-in is GitHub OAuth only, so the app never handles password hashes.

## Getting started

### Prerequisites
- Node.js 20.9+
- A MongoDB Atlas cluster (free M0 is fine)
- A GitHub OAuth App (callback URL `http://localhost:3000/api/auth/callback/github`)

### Setup

```bash
git clone <repo-url> mini-jira
cd mini-jira
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 and sign in with GitHub. Atlas must allow your IP under *Network Access*.

### Environment variables

| Name | Description |
|---|---|
| `MONGODB_URI` | Atlas connection string, with the database name `/mini-jira` before `?` |
| `AUTH_SECRET` | Random secret for signing sessions (`npx auth secret`) |
| `AUTH_GITHUB_ID` | GitHub OAuth App client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret |

Never commit `.env.local`. It is already in `.gitignore`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run seed -- you@example.com [KEY]` | Creates a demo project (`DEMO` unless you pass a key) with 15 issues. The email must belong to someone who has signed in once. Refuses to run when `NODE_ENV=production`. |

## Testing

`npm test` runs 51 unit tests:

- `src/lib/order.test.ts`: midpoint, top, bottom and empty column; when a rebalance is needed (exactly after 20 halvings); renumbering in a single `bulkWrite`; 60 cards dropped into the same gap stay in order.
- `src/lib/permissions.test.ts`: member, admin and non-member for `getMembership`, `requireMember`, `requireAdmin` and the non-throwing variants used by Server Actions.
- `src/proxy.test.ts`: the signed-in / signed-out redirects with real tokens, on https (cookie `__Secure-authjs.session-token`), on http, and behind a proxy. This is the regression test for a production-only login loop.
- `src/actions/members.test.ts`: the last-admin guard when demoting and removing, adding by email, issues unassigned when a member is removed.

The database is mocked, so these tests check the logic and the shape of the queries, not MongoDB itself. I checked the real behavior (including two admins demoting each other at the same time, and 60 drops into one gap) against Atlas by hand. There is no browser end-to-end test in the repo.

## Deploying (Vercel)

1. Push the repo to GitHub and import it in Vercel (framework: Next.js, default settings).
2. Add the four environment variables above in *Project → Settings → Environment Variables*.
3. In the GitHub OAuth App, add the production callback `https://<your-app>.vercel.app/api/auth/callback/github` (or use a separate OAuth App for production).
4. In Atlas → *Network Access*, allow Vercel. Vercel has no fixed IP on the free plan, so use `0.0.0.0/0` and rely on the database user's password.
5. Redeploy, sign in, and (optional) seed demo data from your machine with `npm run seed -- your@email`.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `querySrv ECONNREFUSED _mongodb._tcp...` | The local DNS resolver can't look up the SRV record behind a `mongodb+srv://` URI (common on some Windows / ISP DNS setups) | In Atlas → Connect → Drivers, turn on **Legacy URI String** and use the `mongodb://host1,host2,host3/...` form. Keep `authSource=admin`. |
| `connect ETIMEDOUT ...:27017` / "IP isn't whitelisted" | Your current IP is not in Atlas *Network Access* (it changes on some networks) | Add your current IP, or retry if the network was just flaky. |
| `bad auth : authentication failed` | Wrong DB user / password, or `<` `>` left around the password | Reset the password under Atlas → Database Access. Avoid `@ : / # ? %` in it. Restart `npm run dev`. |
| `Missing MONGODB_URI` | The line is missing `MONGODB_URI=`, the file isn't saved, or the server wasn't restarted | Fix `.env.local`, then restart the dev server (env is only read on startup). |
| GitHub says `redirect_uri_mismatch` | The OAuth App's callback URL does not match the address you are using | Set it to `http://localhost:3000/api/auth/callback/github` (or your production URL). |
| `npm error ENOENT ... package.json` when running a script | You ran the command outside the project folder | `cd` into `mini-jira` first. |

## Project structure

```
src/
├─ app/
│  ├─ page.tsx, login/         # landing and sign-in
│  ├─ (app)/projects/          # signed-in area (header + toasts)
│  │  └─ [key]/                # board, issues/[number], settings; each has its own loading.tsx
│  └─ api/auth/[...nextauth]/  # Auth.js handlers
├─ actions/                    # Server Actions (all writes): auth, projects, issues, members
├─ components/                 # UI: board/ (Board, Column, IssueCard, FilterBar), settings/, forms, Toast
├─ lib/                        # db, auth, permissions, order, queries, board-filters, constants
├─ models/                     # Mongoose schemas: User, Project, Issue
├─ proxy.ts                    # Next 16 replacement for middleware
scripts/seed.ts                # demo data
docs/screenshots/              # images used in this README
```

## What I learned

- **SRV DNS can fail on your own machine.** `mongodb+srv://` needs an SRV lookup that some DNS setups refuse. The legacy `mongodb://` URI from Atlas avoids it, and the error message is the first thing to search for.
- **Fractional ordering beats renumbering.** Storing a float `order` makes a drag a one-document write. The edge cases are what take the time: dropping at the top or bottom, an empty column, and renumbering when the gap runs out. Letting the server compute the value from the neighbours (and not trusting a client-sent number) keeps it consistent.
- **Authorization belongs on the server, and atomically.** Every action re-checks the session and role, treats non-members as "not found", and puts rules like "keep one admin" in the query itself instead of read-then-write.
- **Cache Components wants a loading boundary for every segment you navigate into.** `next build` was clean while the browser console complained, so I found it by clicking through every page from each sibling.
- **Touch and drag fight each other.** A long press on a link inside a scrolling area is unreliable across phones; a dedicated drag handle with `touch-action: none` works everywhere.

## License

MIT
