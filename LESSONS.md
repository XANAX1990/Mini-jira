## 2026-10-22 · Sign out doesn't sign out (Phase 2)
- **Symptom:** after Sign out, the `authjs.session-token` cookie was still there and /projects still loaded without going to /login.
- **Root cause:** `src/proxy.ts` used the `NextAuth(...).auth` wrapper, which re-issues the session cookie on every matched request. The sign-out response therefore carried two `Set-Cookie: authjs.session-token` headers: a fresh token from the proxy and the delete (`Max-Age=0`) from `signOut()`. Two writers for the same cookie is a race; whichever one the client or Next.js merge keeps wins. (Reproduced the double header with a forged JWT and a POST to the Sign out server action. I did not reproduce the stuck cookie itself, so this is the most likely cause, not a confirmed one.)
- **Fix:** `src/proxy.ts` now only reads the JWT with `getToken` and redirects to `/login` when there is none; it never writes cookies. Removed the unused `authorized` callback from `src/lib/auth.config.ts` and the spread of it in `src/lib/auth.ts`. After the fix the sign-out response has a single session-token header, the delete. Commit `be47f45`.
- **Rule:** The proxy only reads the session. Only Auth.js route handlers and server actions may set or delete auth cookies.

## 2026-10-22 · Other Phase 2 gotchas
- **`.env.example` was git-ignored:** the `.env*` pattern in `.gitignore` also matches it. Added `!.env.example`.
- **`UntrustedHost` under `next start`:** Auth.js only auto-trusts the host in dev. Added `trustHost: true` in `src/lib/auth.config.ts` (Vercel sets the host itself).
- **`proxy.ts` must export a function:** `export const { auth: proxy } = NextAuth(...)` failed the build with "must export a function". Export a plain `proxy` function instead.
- **Cache Components:** anything reading the session (`auth()`, `requireUser()`) must sit inside `<Suspense>`, otherwise the build fails on dynamic data. Header, the landing CTA and the login form are wrapped.

## 2026-10-22 · Back button after Sign out (Phase 2)
- **Risk:** Back after Sign out could show the protected page from the browser's back/forward cache or the client router cache.
- **Fix:** Sign out redirects to `/login` (`src/components/Header.tsx`); `next.config.ts` sends `Cache-Control: no-store` for `/projects/**` so the browser won't keep those pages.
- **Rule:** Protected routes are `no-store`; sign-out lands on `/login`.
