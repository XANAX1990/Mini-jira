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
