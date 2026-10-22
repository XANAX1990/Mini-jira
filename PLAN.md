# Mini Jira: Implementation Plan

This file is the source of truth for building Mini Jira. It is written for a coding agent (Claude Code) to execute phase by phase, and for me to track progress.

## Progress

- [x] Phase 1: Foundation (scaffold, DB, models)
- [x] Phase 2: Authentication (GitHub OAuth)
- [x] Phase 3: Projects & permissions core
- [ ] Phase 4: Issues CRUD
- [ ] Phase 5: Kanban board (drag & drop)
- [ ] Phase 6: Members & roles management
- [ ] Phase 7: Polish (filters, search, UX states, seed data)
- [ ] Phase 8: Tests, deploy, docs

---

## Working agreement (read before every phase)

1. **One phase at a time.** Do the phase, run every check in its *Verify* list, tick its boxes in this file, commit, then **stop and report**: what changed, what to test manually, anything I need to do (e.g. create an OAuth app, add an env var). Don't start the next phase until I say so.
2. **Commit per phase** with the message `phase N: <short summary>`. Never commit `.env.local` or any secret.
3. **Read before you write Next.js code.** This project uses **Next.js 16** with **Cache Components enabled** and Turbopack. APIs differ from older versions (for example, middleware is now `proxy.ts`). Follow `AGENTS.md` and check the docs bundled in `node_modules/next/dist/docs/` before using an API you aren't sure about. Check installed package versions in `package.json` before choosing an API.
4. **Security rules (non-negotiable)**
   - Every Server Action re-checks the session **and** the caller's project role on the server. UI hiding is cosmetic only.
   - Validate every action input with Zod. Never pass raw `FormData` or client objects into Mongoose queries.
   - Never trust IDs from the client without checking that they belong to the project the caller is a member of.
5. **Keep the data model stable.** `src/models/*` exists already. If a phase needs a schema change, make the smallest change, explain why in the report, and update the README's *Data model* section.
6. **Scope discipline.** Build only what the phase lists. Put ideas in *Out of scope / later* at the bottom instead of building them.
7. **Global checks** (must pass at the end of every phase):
   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   ```
8. If you're blocked on something only I can do (accounts, secrets, a product decision), stop and ask. Don't invent values or work around it.

## Conventions

- **Routes use the project key:** `/projects/MJ`, `/projects/MJ/issues/12`, `/projects/MJ/settings`.
- **Writes** live in `src/actions/*.ts` (`"use server"`). Return `{ ok: true, data } | { ok: false, error }`. Don't throw for expected errors (validation, forbidden, not found).
- **Reads** happen in Server Components via helpers in `src/lib/queries.ts`.
- **Shared server helpers:** `src/lib/auth.ts` (session), `src/lib/permissions.ts` (membership/role), `src/lib/order.ts` (card ordering).
- Call `connectDB()` inside every server helper/action before querying.
- Serialize Mongoose docs before passing them to Client Components (`.lean()` + convert `ObjectId`/`Date` to strings).
- Tailwind only. No component library unless a phase says so. Keep the UI clean and simple.

---

## Phase 1: Foundation ✅

**Done:** Next.js 16 + TS + Tailwind scaffold, `src/lib/db.ts` (cached Mongoose connection), models `User`, `Project`, `Issue` with indexes, `GET /api/health` returns collection counts. Atlas is reached via a **legacy (non-SRV) URI** because SRV DNS lookups fail on the dev machine.

Leftover task for Phase 2's first commit:
- [x] Remove the `node:dns` / `dns.setServers` lines from `src/lib/db.ts` if they are still there (no longer needed with the legacy URI).
- [x] Add `.env.example` listing every env var from the README, with empty values.

---

## Phase 2: Authentication

**Goal:** Users sign in with GitHub. Every page except the landing and login pages requires a session.

**Decision:** Auth.js (v5) with the GitHub provider and **JWT session strategy, no database adapter**. On sign-in, upsert the user into the `users` collection with the Mongoose `UserModel` (by email), and store the Mongo `_id` in the JWT/session as `session.user.id`.
Before installing, confirm the Auth.js version supports the installed Next.js 16. If it doesn't, stop and report the options instead of forcing it.

**Tasks**
- [x] Install Auth.js. Create `src/lib/auth.ts` exporting `auth`, `signIn`, `signOut`, `handlers`.
- [x] Route handler `src/app/api/auth/[...nextauth]/route.ts`.
- [x] `signIn`/`jwt` callbacks: upsert `User` (name, email, image), put `id` on the token. `session` callback exposes `session.user.id`.
- [x] Type augmentation so `session.user.id` is typed as `string`.
- [x] `src/proxy.ts` (Next 16 replacement for middleware): redirect signed-out users hitting `/projects/**` to `/login`.
- [x] `src/lib/auth.ts` helper `requireUser()` → returns `{ id, name, email, image }` or redirects to `/login`. This is the server-side guard; `proxy.ts` is only the first line of defense.
- [x] Pages: `/` (simple landing with "Sign in with GitHub"), `/login`.
- [x] Header component: avatar, name, Sign out. Shown on signed-in pages.
- [x] Update `.env.example` with `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`.

**Needs from me:** create a GitHub OAuth App (callback `http://localhost:3000/api/auth/callback/github`) and put the credentials in `.env.local`. Tell me the exact steps in the report.

**Verify**
- [x] Signed out: visiting `/projects` redirects to `/login`.
- [x] Sign in with GitHub → lands on `/projects`, header shows my GitHub avatar and name.
- [x] A document appears in `users`. Signing in again doesn't create a duplicate.
- [x] Sign out works and `/projects` is protected again.
- [x] Global checks pass.

---

## Phase 3: Projects & permissions core

**Goal:** Create projects, list my projects, and have one reusable permission layer that every later phase uses.

**Tasks**
- [x] `src/lib/permissions.ts`:
  - `getMembership(projectKey, userId)` → `{ project, role } | null`
  - `requireMember(projectKey)` → uses `requireUser()`, returns `{ user, project, role }`, or `notFound()` if not a member (don't reveal that the project exists)
  - `requireAdmin(projectKey)` → same, plus a forbidden result if the role isn't `admin`
- [x] Action `createProject({ name, key })`: Zod-validate (`key` = 2–6 uppercase letters), creator becomes `ownerId` and the first member with role `admin`. Handle a duplicate key (unique index error) with a friendly message.
- [x] `/projects`: list projects where I'm a member (use the `members.userId` index), showing name, key, my role. Empty state with a "Create project" form/modal.
- [x] `/projects/[key]` layout: project name + key, nav tabs (Board, Settings – Settings visible to admins only). Board page can be a placeholder for now.
- [x] Non-members visiting `/projects/XYZ` get a 404.

**Verify**
- [ ] Create a project → it shows in the list with role Admin.
- [ ] Creating a second project with the same key shows a validation error and no crash.
- [ ] Signed in as a different GitHub account (or by manually removing myself from `members` in Atlas), the project URL returns 404.
- [ ] Global checks pass.

---

## Phase 4: Issues CRUD

**Goal:** Full issue lifecycle, shown as `KEY-number`.

**Tasks**
- [ ] `src/lib/order.ts`: `orderAtEnd(projectId, status)` → (max `order` in that column) + 1000, or 1000 if the column is empty.
- [ ] Action `createIssue(projectKey, input)`: `requireMember`; get the number atomically with `findOneAndUpdate({ _id }, { $inc: { issueCounter: 1 } }, { new: true })`; `reporterId` = current user; `status` = `todo`; `order` = `orderAtEnd`.
- [ ] Action `updateIssue(projectKey, number, patch)`: member; Zod-validate fields (title, description, type, priority, assigneeId, status). `assigneeId` must be a member of the project or null.
- [ ] Action `deleteIssue(projectKey, number)`: **admin only**.
- [ ] Issue detail page `/projects/[key]/issues/[number]`: view + edit form, delete button for admins only (and still enforced in the action).
- [ ] Temporary simple list view on the Board tab (grouped by status) until Phase 5 replaces it.
- [ ] Revalidate the affected pages after each action.

**Verify**
- [ ] Create 3 issues → `MJ-1`, `MJ-2`, `MJ-3` in order. Deleting `MJ-2` and creating a new one gives `MJ-4` (numbers are never reused).
- [ ] Editing each field persists after a refresh.
- [ ] As a member (not admin), the delete button is hidden **and** calling the action directly returns `forbidden`.
- [ ] Assigning to a non-member user ID is rejected.
- [ ] Global checks pass.

---

## Phase 5: Kanban board

**Goal:** Drag cards within and across the three columns, with instant feedback and correct persistence.

**Tasks**
- [ ] Install `@dnd-kit/core` and `@dnd-kit/sortable`.
- [ ] Board Server Component loads all issues of the project in one query (uses the `{ projectId, status, order }` index), grouped into `todo`, `in_progress`, `done`.
- [ ] Client `Board` → `Column` → `IssueCard` (key-number, title, type badge, priority, assignee avatar). Clicking a card opens the issue detail.
- [ ] `src/lib/order.ts`: `orderBetween(before?, after?)`: midpoint; top of column = `after - 1000`; bottom = `before + 1000`; empty = 1000.
- [ ] Action `moveIssue(projectKey, number, { status, beforeNumber?, afterNumber? })`: member; compute the new `order` **on the server** from the neighbours' current values (don't trust a client-sent `order`); update the one issue.
- [ ] **Rebalance:** if the gap between neighbours is < 0.001, renumber that column to 1000, 2000, 3000… in one `bulkWrite`, then place the card.
- [ ] Optimistic update with `useOptimistic`; roll back and show an error toast if the action fails.
- [ ] Quick "+ Add issue" at the top of the To do column.
- [ ] Keyboard-accessible dragging (dnd-kit keyboard sensor).

**Verify**
- [ ] Reorder within a column and move across columns; order survives a hard refresh.
- [ ] Each move updates exactly one document in the normal case (log or check in Atlas).
- [ ] Force a rebalance (e.g. a unit test or script that drops 60 cards into the same gap) → order stays correct.
- [ ] Simulated failure (throw in the action) → card snaps back and an error shows.
- [ ] Global checks pass.

---

## Phase 6: Members & roles

**Goal:** Admins manage who is in a project and with which role.

**Decision:** Invite by **email of an existing user** (they must have signed in once). Show a clear message if the email isn't found ("Ask them to sign in to Mini Jira first"). Invite links/codes are out of scope.

**Tasks**
- [ ] `/projects/[key]/settings` (admin only via `requireAdmin`): rename project, members table (avatar, name, email, role).
- [ ] Actions (all admin only): `addMember(email, role)`, `changeRole(userId, role)`, `removeMember(userId)`, `renameProject(name)`, `deleteProject(confirmKey)` (must type the key to confirm; deletes its issues too).
- [ ] **Last-admin guard:** reject demoting or removing the only admin.
- [ ] Removing a member unassigns them from that project's issues.
- [ ] Assignee picker on issues lists only current members.

**Verify**
- [ ] Add a second account as Member → it sees the project; it can't open Settings (404/forbidden) or call admin actions.
- [ ] Promote it to Admin → Settings appears for it.
- [ ] Trying to demote/remove the last admin shows an error.
- [ ] Removing a member clears their assignments.
- [ ] Global checks pass.

---

## Phase 7: Polish

**Goal:** Feels like a finished product, good enough to demo in an interview.

**Tasks**
- [ ] Board filters: assignee (incl. "Unassigned" and "Me"), type, priority. Text search on title. Keep filter state in the URL query string.
- [ ] `loading.tsx`, `error.tsx`, `not-found.tsx` for the project routes.
- [ ] Empty states (no projects, empty column, no search results).
- [ ] Toasts for action results.
- [ ] Responsive: on mobile, columns stack/scroll horizontally and drag still works (touch sensor).
- [ ] Dark mode via Tailwind `dark:` (follow system).
- [ ] `scripts/seed.ts` (`npm run seed`): creates a demo project `DEMO` with ~15 realistic issues across all columns for the signed-in user's email (passed as an argument). Refuses to run when `NODE_ENV=production`.

**Verify**
- [ ] Filters combine correctly and survive a refresh / shared URL.
- [ ] Lighthouse accessibility score ≥ 90 on the board page.
- [ ] Works at 375 px width.
- [ ] Global checks pass.

---

## Phase 8: Tests, deploy, docs

**Goal:** Live URL, tests for the risky logic, README that sells the project.

**Tasks**
- [ ] Vitest unit tests: `order.ts` (midpoint, ends, empty, rebalance trigger) and `permissions.ts` (member / admin / non-member / last-admin guard).
- [ ] Optional: one Playwright smoke test (sign-in mocked or skipped) that loads the board and moves a card.
- [ ] Delete `src/app/api/health`.
- [ ] Deploy to Vercel: set all env vars; add the production callback URL to the GitHub OAuth App (or create a separate production OAuth App); confirm Atlas Network Access allows Vercel.
- [ ] README: replace the status column with ✅, add a live demo link, 2–3 screenshots or a GIF of drag & drop, and a short "What I learned" section (SRV DNS issue, fractional ordering, server-side authorization).
- [ ] Add `npm test` to the global checks.

**Verify**
- [ ] `npm test` passes.
- [ ] Production: sign in, create project, create issues, drag cards, manage members. All work.
- [ ] No secrets in the repo (`git log -p | grep -i -E "mongodb(\+srv)?://|secret"` returns nothing sensitive).

---

## Out of scope / later

- Comments and activity history on issues
- Sprints, story points, epics
- Real-time multi-user updates (websockets / change streams)
- Invite links, email notifications
- Attachments
- Email/password sign-in
