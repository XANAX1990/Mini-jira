@AGENTS.md
@PLAN.md
@README.md
When a bug's root cause wasn't obvious, add an entry to LESSONS.md (symptom, root cause, fix, rule) and add the one-line rule under "## Rules" in this file.

## Rules
- The proxy only reads the session; only Auth.js handlers and server actions may set or delete auth cookies (see LESSONS.md).
- With Cache Components, call `await connection()` before any helper that uses crypto/randomness without reading request data first; `requireUser()` already does (see LESSONS.md).
- Never call Auth.js `auth()` directly: use `getSession()` (nullable) or `requireUser()` from `src/lib/auth.ts`; ESLint enforces it.
- Code that reads the session cookie by hand (proxy.ts) must pick the cookie name by protocol (`isHttpsRequest`): `__Secure-authjs.session-token` on https. Test auth over https too, not only http localhost.
- Pages that don't need the session (landing, login) stay static: signed-in redirects for them live in `src/proxy.ts`, never in the page.
- Before calling a fix done, run `npm run build && npm start`, request every route signed out and signed in, and read the server log.
- Vercel env vars: the Value box holds only the value (`mongodb+srv://...`), never a `KEY=value` line (see LESSONS.md).
- After changing `AUTH_SECRET`, clear the site's cookies before testing sign-in; old cookies cannot be decoded with a new secret.
- Local `.env.local` uses the database `mini-jira`; production uses `mini-jira-prod`. Never leave `.env.local` pointing at production, and run seed/tests only against local.
- Mutation-test a new file only after `git add`; restore with `git checkout -- <file>` and re-run the full suite afterwards.
- `/` and `/login` are prerendered, so env vars they read (`AUTH_GOOGLE_*` via `src/lib/providers.ts`) are fixed at build time: redeploy after changing them.
- The email is the user key (accounts link by it). Never change *which* email is picked for a provider without a migration, and only use emails the provider reports as verified (`isSignInAllowed`, `src/lib/github-profile.ts`).
