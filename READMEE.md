# Mini Jira

A lightweight issue tracker with a drag-and-drop Kanban board and per-project roles. I built it to practice full-stack work end to end: authentication, relational-style data in MongoDB, server-side authorization, and optimistic UI.

> **Status:** in development. See [`PLAN.md`](./PLAN.md) for the roadmap and current progress.

---

## Features

| Feature | Status |
|---|---|
| MongoDB connection + data models | ✅ Done |
| Sign in with GitHub | ⏳ Planned |
| Projects with short keys (e.g. `MJ` → `MJ-1`, `MJ-2`) | ⏳ Planned |
| Issues: create / edit / delete, type, priority, assignee | ⏳ Planned |
| Kanban board with drag & drop (To do / In progress / Done) | ⏳ Planned |
| Per-project roles: **Admin** and **Member** | ⏳ Planned |
| Invite members, change roles, remove members | ⏳ Planned |
| Filters and search on the board | ⏳ Planned |

## Tech stack

- **Framework:** Next.js 16 (App Router, Server Actions, Turbopack), TypeScript
- **Styling:** Tailwind CSS
- **Database:** MongoDB Atlas + Mongoose
- **Auth:** Auth.js (GitHub OAuth, JWT sessions)
- **Drag & drop:** dnd-kit
- **Validation:** Zod
- **Deploy:** Vercel + MongoDB Atlas (free tiers)

## Architecture

```
Browser ──► Next.js (App Router)
              ├─ Server Components  → read data (projects, board)
              ├─ Server Actions     → every write (create/move/delete issue, manage members)
              │     └─ permission check on the server, every time
              └─ Auth.js            → GitHub OAuth, session in a signed JWT
                        │
                        ▼
                 MongoDB Atlas (users, projects, issues)
```

Writes go through Server Actions, not public REST endpoints. Each action loads the caller's membership and checks the role **on the server** before touching the database. Hiding a button in the UI is only for UX, not for security.

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
| Invite / remove members, change roles | ✅ | ❌ |
| Rename / delete project | ✅ | ❌ |

A project must always have at least one admin. The last admin cannot be demoted or removed.

## Design decisions

- **Roles live on the project, not on the user.** The same person can be an admin in one project and a member in another.
- **Issue numbers come from an atomic counter.** Creating an issue runs `$inc` on `Project.issueCounter` and uses the returned value. The unique index catches anything that slips through.
- **Card order is a float.** A card dropped between two others gets the midpoint of their `order` values, so a move updates **one** document instead of renumbering the column. When the gap gets too small, the column is renumbered once.
- **Cached DB connection.** In dev, Next.js re-evaluates modules on every save. The Mongoose connection is cached on `globalThis` so it doesn't open a new connection each time and use up Atlas's connection limit.
- **No passwords stored.** Sign-in is GitHub OAuth only, so the app never handles password hashes.

## Getting started

### Prerequisites
- Node.js 20+
- A MongoDB Atlas cluster (free M0 is fine)
- A GitHub OAuth App (needed from the auth phase onward)

### Setup

```bash
git clone <repo-url> mini-jira
cd mini-jira
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000. `GET /api/health` should return `{"ok":true,...}` when the database is reachable.

### Environment variables

| Name | Description |
|---|---|
| `MONGODB_URI` | Atlas connection string, with the database name `/mini-jira` before `?` |
| `AUTH_SECRET` | Random secret for signing sessions (`npx auth secret`) |
| `AUTH_GITHUB_ID` | GitHub OAuth App client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret |

Never commit `.env.local`. It is already in `.gitignore`.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `querySrv ECONNREFUSED _mongodb._tcp...` | The local DNS resolver can't look up the SRV record behind a `mongodb+srv://` URI (common on some Windows / ISP DNS setups) | In Atlas → Connect → Drivers, turn on **Legacy URI String** and use the `mongodb://host1,host2,host3/...` form. Keep `authSource=admin`. |
| `bad auth : authentication failed` | Wrong DB user / password, or `<` `>` left around the password | Reset the password under Atlas → Database Access. Avoid `@ : / # ? %` in it. Restart `npm run dev`. |
| `Missing MONGODB_URI` | The line is missing `MONGODB_URI=`, the file isn't saved, or the server wasn't restarted | Fix `.env.local`, then restart the dev server (env is only read on startup). |

## Project structure

```
src/
├─ app/
│  ├─ (auth)/login/            # sign-in page
│  ├─ projects/                # project list
│  │  └─ [key]/                # board, issue detail, settings
│  └─ api/
│     ├─ auth/[...nextauth]/   # Auth.js handlers
│     └─ health/               # DB health check (removed before deploy)
├─ actions/                    # Server Actions (all writes)
├─ components/                 # UI: board/, issue/, ui/
├─ lib/                        # db.ts, auth.ts, permissions.ts, order.ts
└─ models/                     # Mongoose schemas: User, Project, Issue
```

## License

MIT
