## 2026-10-22 · Sign out doesn't sign out (Phase 2)
- **Symptom:** after Sign out, the `authjs.session-token` cookie was still there and /projects still loaded without going to /login.
- **Root cause:** `src/proxy.ts` used the `NextAuth(...).auth` wrapper, which re-issues the session cookie on every matched request. The sign-out response therefore carried two `Set-Cookie: authjs.session-token` headers: a fresh token from the proxy and the delete (`Max-Age=0`) from `signOut()`. Two writers for the same cookie is a race; whichever one the client or Next.js merge keeps wins. (Found by replaying the Sign out server action with a forged JWT and seeing the double header. After the fix, sign out was verified in the browser: cookie gone, /projects redirects to /login.)
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

## 2026-10-22 · `crypto.getRandomValues()` while prerendering (Phase 3)
- **Symptom:** every request to a page with `<Header />` logged `Route "/projects": Next.js encountered the unstable value crypto.getRandomValues() while prerendering`, pointing at `<Header />` in `src/app/(app)/layout.tsx`. The page still rendered, and `npm run build` passed.
- **Root cause:** `requireUser()` called `auth()`, which uses crypto before it reads any request data, so Cache Components treated that code as part of the prerender. Moving the inline `"use server"` closures out of `Header` did not change anything, so they were not the cause.
- **Fix:** `await connection()` at the top of `requireUser()` in `src/lib/auth.ts`. The log is clean afterwards. Sign in/out actions now live in `src/actions/auth.ts`, as the plan's conventions ask.
- **Rule:** With Cache Components, call `await connection()` before any helper that uses crypto or randomness and does not read request data first. The build will not warn you, so check the server log for `blocking-prerender-crypto`.

## 2026-10-22 · Non-member 404 has status 200 (Phase 3)
- **Observation:** `/projects/XYZ` for a non-member renders the not-found UI, but the HTTP status is 200. The project shell streams inside `<Suspense>`, so the status is already sent when `notFound()` runs. The page does not reveal that the project exists, and the content is the 404 page. Fixing the status would need the membership check outside Suspense, which Cache Components does not allow for request-time data.

## 2026-10-22 · "uncached data during prerendering or a navigation" on the board (Phase 5)
- **Symptom:** browser console error on `/projects/[key]`: `connection()` accessed outside of `<Suspense>`, stack `requireUser` ← `requireMember` ← `BoardPage`. Only shows up on client-side navigation, so HTTP requests and `next build` never reported it.
- **Root cause:** the Suspense boundary lived in `[key]/layout.tsx`, above the pages. When the layout stays mounted and only the page segment changes (Board ↔ Issue ↔ Settings), the new page awaits request data with no boundary of its own below the layout.
- **Fix:** `src/app/(app)/projects/[key]/loading.tsx` gives every page under `[key]` its own boundary. Confirmed in the browser: the console error is gone.
- **Rule:** With Cache Components, every route segment that reads request data needs a `loading.tsx` or its own `<Suspense>`; a boundary in a parent layout is not enough for navigation between sibling pages. Check the browser console, not only the server log.

## 2026-10-22 · Contrast failures only show in dark mode (Phase 7)
- **Symptom:** Lighthouse accessibility 96 on the board page, one failure: the project key (`text-zinc-500`) had too little contrast.
- **Root cause:** `zinc-500` passes on white but not on the near-black dark background. Several small texts used it. Gray panels (`zinc-100`) are also too light for `zinc-500`.
- **Fix:** `zinc-600` in light mode and `dark:text-zinc-400` in dark mode for small secondary text. Score is 100 in light/dark, mobile/desktop.
- **Rule:** Check accessibility in both color schemes. Use `text-zinc-600 dark:text-zinc-400` for secondary text, never bare `text-zinc-500`.

## 2026-10-22 · Keyboard drag sometimes ignores the first arrow press (Phase 5 behavior, found in Phase 7)
- **Observation:** with a card lifted by Space, the first arrow press can leave the drop target unchanged (always seen with ArrowRight, sometimes with ArrowDown); the next press moves it. Identical in the Phase 5 and Phase 7 builds, so it comes from dnd-kit's keyboard coordinates with this layout, not from a recent change. Cross-column drop by keyboard works and persists.
- **Status:** left as is (out of scope for Phase 7). A custom `coordinateGetter` would fix it if it matters in the demo.

## 2026-10-22 · Test setup notes
- Real-browser checks (drag, touch, keyboard, 375px, dark mode) ran with `puppeteer-core` and the installed Chrome, kept outside the repo. Lighthouse ran with `npx lighthouse` and a forged Auth.js session cookie.
- `npm run seed -- email` needs `tsx` (devDependency) because `db.ts` and the models use the `@/` alias.

## 2026-10-23 · Phone: long-press drag on the whole card didn't work (Phase 7)
- **Symptom:** on the phone-sized board nothing could be dragged by touch, while Tab/arrow keys and sideways scrolling worked. The same long-press drag passed in my automated Chrome run (raw touch events), so it only failed in the user's setup.
- **Root cause (likely, not reproduced):** the card is one big link inside a sideways-scrolling container. Browsers use a long press or a small finger move for link menus, text selection and starting a scroll, which cancels the touch sequence before dnd-kit's 200 ms delay finishes. I could not reproduce DevTools' mouse-as-touch mode: puppeteer's `mouse.down` hangs in that mode even on an empty page.
- **Fix:** each card has a drag handle (`touch-action: none`, top right). `TouchSensor` has a 5 px distance constraint and is only started from the handle (`onTouchStart` is filtered in `IssueCard`), so a finger drags immediately from the handle and a swipe anywhere else scrolls the board. Mouse and keyboard still grab the whole card. Cards also got `select-none` and `-webkit-touch-callout: none`.
- **Verified (raw touch events, 375px):** drag from the handle moves and persists; swipe from the card body scrolls 16 → 324 without moving a card; tap opens the issue; desktop mouse drag from the card body still works.
- **Rule:** On touch screens give draggable items in a scrolling area a dedicated handle with `touch-action: none` instead of relying on long-press.

## 2026-10-23 · "uncached data during prerendering or a navigation" again, on Settings and Issue pages (Phase 7)
- **Symptom:** the same console error as the board page, now on `/projects/[key]/settings` and `/projects/[key]/issues/[number]` when clicking the Settings tab or a card. Server log and `next build` stayed clean.
- **Root cause:** the earlier fix put one `loading.tsx` at `[key]/`. When you navigate from the board, that boundary is already on screen, so the new segment (`settings/`, `issues/[number]/`) has no boundary of its own. The board page only looked fixed because I had only navigated from the project list, where `[key]` itself was the new segment.
- **Fix:** `loading.tsx` inside `settings/` and `issues/[number]/` (not `issues/`: the dynamic segment is the one that needs it). Reproduced and checked by clicking through list → board → Settings → board → issue → board → Settings → list in Chrome against the dev server and reading the console: 7 of 7 steps clean, 2 of 7 failed before.
- **Rule:** Every route segment you can navigate *into* needs its own `loading.tsx` (or `<Suspense>`), including dynamic `[param]` segments. Test navigation by clicking from each sibling page, not only from the page above, and read the browser console.

## 2026-10-23 · Dropdown text unreadable in dark mode (Phase 7)
- **Symptom:** every `<select>` list (board filters, role pickers) showed near-invisible text in dark mode: light text on a white list.
- **Root cause:** the open list of a native select is drawn with the options' own colors. The options inherited the page's light text color, but the list background stayed white because the selects use `bg-transparent`. `color-scheme: light dark` alone did not fix it on Windows Chrome.
- **Fix:** `option, optgroup { background-color: var(--background); color: var(--foreground) }` in `globals.css`. Computed contrast is now 16.9:1 (dark) and 17.9:1 (light) on all pages with selects.
- **Rule:** Style `option` explicitly whenever a select is transparent; Lighthouse does not check the popup, so look at it by eye in dark mode.

## 2026-10-23 · `crypto.getRandomValues()` while prerendering, again, on `/` in production (Phase 8)
- **Symptom:** Vercel runtime logs showed `Error: Route "/": Next.js encountered the unstable value 'crypto.getRandomValues()' while prerendering` on every visit to the landing page. The page still rendered and `next build` was clean.
- **Root cause:** the Phase 3 fix (`await connection()` before Auth.js) only went into `requireUser()`. The landing page (`/`) and `/login` still called `auth()` directly to redirect signed-in users, so Auth.js touched crypto before reading any request data. The routes I tested after the Phase 3 fix were all signed-in ones, which go through `requireUser()`; I never loaded `/` or `/login` against a production build and read its log.
- **Fix:** `getSession()` in `src/lib/auth.ts` (`await connection()` then `auth()`), used by `requireUser()`, `src/app/page.tsx` and `src/app/login/page.tsx`. ESLint now rejects `import { auth } from "@/lib/auth"` outside `lib/auth.ts` and `proxy.ts`, so the next page cannot repeat it. Reproduced before the fix with `npm run build && npm start` (errors for `/` and `/login`, none for other routes); after it, 0 errors in the server log for all 9 routes checked signed out and signed in, as page loads and as RSC navigations, plus the sign-out and create-issue actions.
- **Rule:** When a bug is fixed in a helper, grep for every other caller of the thing the helper wraps. Check the *production* server log for every route, signed out as well as signed in (`npm run build && npm start`, then request each route). Never call `auth()` directly: use `getSession()` or `requireUser()`.

## 2026-10-23 · Same crypto error on `/` still reported from Vercel after the `getSession()` fix (Phase 8)
- **Symptom:** after `c034a3b` was pushed to `origin/main`, the user still saw `Route "/": ... crypto.getRandomValues() while prerendering` in Vercel runtime logs (marked `ƒ`, i.e. a function ran for `/`).
- **What I could not do:** reproduce it. A fresh clone of `origin/main` (`npm ci`, `next build`, `next start` with `VERCEL=1`, `x-forwarded-*` headers, repeated hits on `/` and `/login`, a real Chrome visit) logged 0 errors. So whether the Vercel logs came from an older deployment, a different cause, or something that only exists there is unproven.
- **Change made anyway (removes the whole code path):** `/` and `/login` no longer read the session. `src/proxy.ts` (read-only, per request) redirects signed-in users to `/projects`; the two pages are plain static pages (`○ (Static)` in the build output, no function runs for them). Signed-in visitors now get a real 307 instead of a 200 that redirects later. Checked on a production build with `VERCEL=1`: signed out, signed in, garbage cookie, token signed with the wrong secret, all other routes, RSC navigations and the sign-out / create-issue actions; server log 0 errors.
- **Rule:** A page that does not need the session must not read it. Do redirects for signed-in users in `proxy.ts`, keep landing/login static, and use `getSession()` / `requireUser()` only in pages that are inherently per-user. If a production-only error cannot be reproduced locally, get the deployment's commit SHA and the full log stack before changing more code.

## 2026-10-23 · Login loop on Vercel: proxy.ts could not see the https session cookie (Phase 8)
- **Symptom:** on `https://mini-jira-tan.vercel.app` signing in with GitHub returned to the login page again and again. Everything worked on `http://localhost`.
- **Root cause:** `proxy.ts` reads the session with `getToken()`, whose default is the http cookie name `authjs.session-token`. On https Auth.js names the cookie `__Secure-authjs.session-token`, so in production the proxy never found a session: `/projects` always redirected to `/login`, and `/login` never redirected a signed-in user to `/projects`. The pages themselves use `auth()`, which does pick the right name, so proxy and pages disagreed. Introduced when the proxy stopped using the `NextAuth().auth` wrapper (Phase 2 sign-out fix) and never caught because every test, mine and the user's, ran over http with the unprefixed name.
- **Fix:** `src/lib/secure-request.ts` (`isHttpsRequest`: `x-forwarded-proto` first, then the URL, like Auth.js) and `proxy.ts` passes `secureCookie` to `getToken`. `src/proxy.test.ts` (11 tests) runs the real `getToken` with real tokens for both cookie names, on https, on http, and behind a proxy (`x-forwarded-proto` while the URL says http); removing the fix makes 4 of them fail. Checked on a production build with https headers: the whole loop (signed out, after login, refresh, `/login` and `/` redirects, board, settings, issue, non-member, sign out clearing `__Secure-authjs.session-token`), server log 0 errors. Not checked: a real GitHub login on the real Vercel deployment.
- **Not the cause:** the `InvalidCheck pkceCodeVerifier ... could not be parsed` lines. That message also wraps "cookie was missing". The ~0.4 s bursts in the Vercel logs at 04:53-04:54 on Oct 23 were my own curl timing tests with fake codes. The single `InvalidCheck` at 04:41 came from the deployment URL (`mini-jira-nbtcowhwt-...vercel.app`), which is behind Vercel Authentication (SSO); sign in only on the production domain.
- **Rule:** Anything that reads the session cookie by hand must take the cookie name from the protocol, the way Auth.js does. Test auth flows over https too: send `x-forwarded-proto: https` and a cookie named `__Secure-authjs.session-token`. A signed-in user, a signed-out user and a wrong-protocol cookie are three separate cases.

## 2026-10-23 · Sign out, then Sign in goes straight back in (not a bug)
- **Observation:** in an incognito window on production, after Sign out, pressing "Sign in with GitHub" signed the user in again without asking for anything.
- **Cause:** Sign out only deletes Mini Jira's own session cookie (`__Secure-authjs.session-token`). The user is still signed in to github.com in that browser and has already authorized the app, so GitHub redirects back to the callback immediately and the app creates a new session. Standard OAuth behavior. The app's sign-out itself works: after it, `/projects` redirects to `/login`.
- **If a different account must be pickable:** sign out of github.com in the same window, or close all incognito windows. In code, GitHub may accept `prompt=select_account` in the provider's `authorization.params`; not tried, because it needs a real GitHub session to test, and it makes everyday sign-in slower.
- **Rule:** "Sign out" means signing out of Mini Jira, not of GitHub. Don't report a repeat sign-in with a live GitHub session as a bug.
