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

## 2026-10-22 · Keyboard drag sometimes ignores the first arrow press (Phase 5 behavior, found in Phase 7) — RESOLVED 2026-10-23, see the entry at the end
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

## 2026-10-23 · Deploy summary: where the prerender `crypto.getRandomValues()` error shows up
- **What to remember:** `next build` never reports it. The `Route "...": Next.js encountered the unstable value 'crypto.getRandomValues()' while prerendering` message appears in *runtime* logs: the dev server, `next start` and Vercel's function logs. It is not limited to production. The page still renders, so it is easy to miss; it came from Cache Components treating Auth.js (`auth()`) as part of the prerender. Details and the fixes are in the three entries above (Phase 3, `getSession()`, static `/` and `/login`).
- **Rule:** Check the runtime log of a `build && start` run for every route, signed out and signed in, before calling a deploy done.

## 2026-10-23 · Stale auth cookies after rotating `AUTH_SECRET` (reported during the deploy, not reproduced by me)
- **Report:** after `AUTH_SECRET` was changed in Vercel, sign-in kept failing on the callback (`bad_verification_code`, `InvalidCheck pkceCodeVerifier ...`) until the site's data was cleared in the browser.
- **Why it fits:** the session and PKCE cookies are encrypted with a key derived from `AUTH_SECRET`. Cookies made with the old secret cannot be decoded with the new one, so Auth.js treats them as invalid (and `could not be parsed` is the message it wraps most decode failures in). `bad_verification_code` is GitHub saying the one-time `code` is wrong, expired or already used, which happens when a callback URL is replayed (refresh, Back, an old tab).
- **Fix:** clear the site's cookies (or use a fresh incognito window) after changing `AUTH_SECRET`, then sign in from the production domain.
- **Caution:** this happened around the same time as the proxy cookie-name bug (entry "Login loop on Vercel"), which is the cause I proved and fixed in code. Several log lines at 04:53-04:54 on Oct 23 were my own test requests. Do not assume every `InvalidCheck` line is a real user.
- **Rule:** After rotating `AUTH_SECRET`, expect everyone to be signed out and clear cookies before testing.

## 2026-10-23 · Vercel env var value pasted as `KEY=value` (`MongoParseError: Invalid scheme`)
- **Symptom:** on Vercel the database connection failed with `MongoParseError: Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"`.
- **Cause:** the *Value* field contained `MONGODB_URI=mongodb+srv://...` instead of just the URI. The name goes in the *Key* field. (The error text is thrown by the driver when the string does not start with one of those two schemes; checked in `mongodb-connection-string-url`.)
- **Fix:** Value = `mongodb+srv://...` only, then redeploy.
- **Rule:** In Vercel, Key and Value are separate boxes; never paste a `.env` line into Value. The same mistake on `AUTH_SECRET` would not fail loudly (the secret would just contain `AUTH_SECRET=` at the start), so check every variable.

## 2026-10-23 · Databases: local vs production
- Local development (`.env.local`) uses the database `mini-jira`. Production on Vercel uses `mini-jira-prod` (as stated by the project owner; the Vercel value is not visible from the repo).
- So the test projects made locally do not appear on the live demo, and `npm run seed`, scripts and manual tests run from this machine only touch `mini-jira`.
- To put demo data on production, temporarily point `MONGODB_URI` in `.env.local` at `.../mini-jira-prod`, run `npm run seed -- <email> [KEY]`, and restore the value. Never leave `.env.local` pointing at production.

## 2026-10-23 · Phase 9 notes: mutation checks on an untracked file, Google OIDC testing, build-time env
- **Mutation check mistake (mine):** I broke a new, still untracked file on purpose to see the tests fail, "restored" it with `git checkout`, which does nothing for an untracked file, and then backed up the already broken copy. The file stayed broken (the Google verified-email check was gone) and only the next test run showed it. Fixed by hand and redone after staging the file. **Rule:** `git add` a new file before mutating it, restore with `git checkout -- <file>`, and finish with a full test run and a diff against what was staged.
- **Testing Google without a Google login:** the callback needs the `iss` query parameter that Google always sends; without it Auth.js fails with `response parameter "iss" (issuer) missing` before it looks at any cookie, so a hand-made callback tells you nothing. With `iss` and a fake `code` the token call returns `invalid_grant` and the log line shows the PKCE cookie was accepted. To see whether a redirect URI is registered, request the authorize URL and compare with a control: an unregistered URI ends on `accounts.google.com/signin/oauth/error` (`redirect_uri_mismatch`), a registered one on `/v3/signin/identifier`. My first classifier called both "blocked" because the regex was too broad.
- **Static pages bake env at build time:** `googleEnabled` (`src/lib/providers.ts`) decides whether `/` and `/login` show the Google button, and those pages are prerendered. Adding `AUTH_GOOGLE_*` in Vercel needs a redeploy before the button appears. That is intended (no broken button before the credentials exist) but easy to forget.
- **Google while the consent screen is in *Testing*:** only listed test users can sign in. Everyone else gets "Access blocked".

## 2026-10-23 · GitHub email must be verified too (hardening after Phase 9)
- **Why:** accounts are linked by email, so an email a provider has not verified could be used to land in someone else's account. Google is checked through `email_verified`. Auth.js' GitHub provider uses the public email, else `primary ?? emails[0]` from `/user/emails`, and never looks at `verified`.
- **Change:** `src/lib/github-profile.ts` replaces only the fallback: public email unchanged, otherwise the primary *verified* email, otherwise any verified one, otherwise none (the sign-in is then refused). Wired in through `userinfo.request` in `auth.config.ts`; Auth.js deep-merges provider options, so the endpoints, scope and `profile()` mapping stay. Checked by running Auth.js' own `parseProviders` merge and calling the merged `userinfo.request` with GitHub mocked.
- **Decision to keep:** do not "simplify" this to always use the primary email. People whose public email differs from their primary would map to a different email, get a new `users` document, and lose their projects.
- **Test gap I caught:** my first test list put the primary email last, so a mutation that took the last verified address passed. Added cases with the primary first, middle and last. **Rule:** when a mutation survives, fix the test, not the mutation.
- **Not verifiable here:** a real GitHub sign-in. Test it on localhost and after the deploy; if it breaks, revert the commit that touched `auth.config.ts` and `github-profile.ts`.

## 2026-10-23 · Theme setting that did nothing (Phase 10)
- **Symptom:** the app was dark while a "Theme: Light" setting was selected, and changing it changed nothing.
- **Cause:** that setting was in the **Next.js Dev Tools panel** (the round N button, `next dev` only). It only restyles the panel itself and is not part of the app. The app had no theme control at all: Tailwind's default `dark:` variant follows `prefers-color-scheme`, so only the OS decided.
- **Fix:** a real switch (Light / Dark / System). `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css` makes every existing `dark:` class follow a `dark` class on `<html>`; the CSS variables and `color-scheme` follow the same class; an inline script in `<head>` sets the class before first paint (`suppressHydrationWarning` on `<html>`); the choice is in `localStorage` (nothing stored = System, which follows the OS live). `/` and `/login` stay static. The dev-tools panel can be hidden with `devIndicators: false` in `next.config.ts` if it keeps confusing people.
- **Easy to miss:** two `@media (prefers-color-scheme: dark)` blocks in `globals.css` (the colour variables and the select arrow) also had to become `.dark` rules, otherwise the page and the controls disagree when the user picks the opposite of the OS. `grep -rn prefers-color-scheme src` should only find `src/lib/theme.ts`.
- **Tooling note:** in puppeteer, opening a second tab sends the first one to the background and clicks on it hang until `page.bringToFront()`. My first run hung and was killed by `timeout`.
- **Rule:** dark-mode CSS uses `dark:` or `.dark`, never `@media (prefers-color-scheme: dark)`.

## 2026-10-23 · README screenshots and the GIF: small gotchas
- **Dev-tools badge:** screenshots taken from `npm run dev` show the round Next.js "N" at the bottom-left. Crop it out (I cut between two cards) or shoot a `npm run build && npm start` run, which has no badge.
- **GIF without a screen recorder:** `puppeteer-core` + the installed Chrome drives a real drag, takes a screenshot per step, and `gifenc` + `pngjs` encode the frames (about 19 frames at 960x680, ~680 KB). The images and the encoder live outside the repo; only the finished GIF is committed.
- **Page scrolled in the middle of the clip:** grabbing a card in the bottom 20% of the viewport makes dnd-kit auto-scroll the page the moment the drag starts, so the header slid out of view. Grab the top of the card and use a viewport tall enough for the board.
- **Privacy:** README images are public. Emails are blacked out; GitHub names and avatars are visible on purpose.

## 2026-10-23 · Keyboard drag: the first ArrowRight went down, not right (root cause found and fixed)
- **Symptom:** with a card lifted by Space, ArrowRight often seemed to do nothing the first time and worked on the second press. I had written it off as a dnd-kit quirk.
- **What the data showed:** a temporary wrapper around the `coordinateGetter` logged what dnd-kit sees. The first ArrowRight from the first To do card moved over the card *below it in the same column* (`i:1 -> i:2`), and only the second press reached the next column. The drag overlay's rect was `left 35, top 323` while the card's was `left 36, top 326`.
- **Root cause:** the drag overlay had `rotate-1` (a tilt) on its first child, and dnd-kit measures the overlay's first child *including transforms*. A 1° tilt grows the bounding box and shifts it by about (-1, -3) px. `sortableKeyboardCoordinates` picks "to the right" with a strict `collisionRect.left < rect.left`, so the card below (left 36 > 35) and, for a column with a single card, the column's own droppable counted as "to the right". ArrowDown, ArrowUp and ArrowLeft passed their strict comparisons by luck, which is why only "right" looked broken.
- **Fix:** the tilt now sits on an inner element (`<DragOverlay><div><div className="... rotate-1 ...">`), so the measured box is untouched and still looks tilted. Nothing else changed; the diagnostic wrapper was removed again.
- **Verified in real Chrome (12 cases):** right once and twice, left, down, up, from first / middle / last / only cards, into an empty column, Escape; each checked on the page, after a reload and in the database. The same cases on the old code: 9/12, with exactly the three "right" cases wrong, so the cases do catch the bug.
- **Rule:** do not put a transform (tilt, scale) on the first child of `DragOverlay`; dnd-kit uses its bounding box for keyboard moves. When something looks like a library quirk, log the library's inputs before accepting it.

## 2026-10-23 · Phase 11 notes: the n8n webhook
- **Not blocking, also on Vercel:** a plain "fire and forget" promise can be frozen the moment a serverless action answers. `after()` from `next/server` runs after the response and keeps the function alive until it finishes. Everything slow (the assignee lookup, the POST) is inside it. Measured: ~240 ms per create with a hanging webhook, the same as with none.
- **`fetch` puts the URL in some error messages**, even a mistyped one without `https://` ("Failed to parse URL from hooks.example.com/webhook/<token>"), and n8n webhook URLs carry a secret in the path. The logger masks the configured URL and secret as well as anything URL-shaped, and logs one line only. A test with a deliberately mistyped URL covers it.
- **Never send unsigned:** URL set but secret missing means no request and one warning, not a "best effort" unsigned call.
- **The link in the alert can be forged if built from request headers:** anyone who can call a Server Action can send their own `x-forwarded-host`. The origin comes from `APP_URL`, then Vercel's own `VERCEL_PROJECT_PRODUCTION_URL`, and only as a last resort (local development) from the request.
- **n8n re-signs a parsed body**, so the signed text must equal `JSON.stringify(JSON.parse(text))`. A test checks this for Thai, emoji, quotes, backslashes, line breaks and U+2028/9.
- **Test harness gotcha (mine):** Node on Windows resolves `/tmp` to `C:	mp`, not to Git Bash's `/tmp` (the real Temp folder). My first end-to-end run "failed" only because the script read the wrong file; the app had delivered a correct message. Use `os.tmpdir()` in Node scripts and compare by looking at the receiver's own record before blaming the app.
- **Rule:** work that waits on a third party goes in `after()`, never in the action path; log one line, never the URL, secret or body; unsigned messages are never sent.

## 2026-10-23 · Phase 11 follow-up: first real run of n8n → LINE
(The owner's request calls this "Phase 10"; it is Phase 11 in this repo because Phase 10 is the theme switch.) These four are from the owner's end-to-end run, not reproduced here.
- **n8n Save is not Publish.** In current n8n, Save stores the draft in the editor; the production webhook URL runs the *published* version. A fixed workflow kept behaving like the old one until it was published. After every edit: Publish (older versions: the Active switch), then test the production URL.
- **A Windows console can freeze n8n (QuickEdit).** Clicking inside the console window starts a text selection, and the process is paused until Enter or Esc. Webhooks then time out ("n8n is off") while the process looks alive. Turn QuickEdit off, or do not click in that window.
- **LINE user IDs are per provider.** The same person has a different `U...` ID under each provider, so a `to` copied from another provider/channel fails with `400`. Take it from *Basic settings* of the channel that sends the push.
- **A separate Official Account needs its own credential.** Its channel access token is not the old one: make a new Header Auth credential in n8n (`Authorization: Bearer <that token>`) and select it on the HTTP Request node; the old credential gives `401` or sends from the wrong bot.
- **Also changed:** the trigger rules after the owner's run: alert on every create and on any priority change (`issue.priority_changed` with `previousPriority`), and a Thai ready-to-show `label` in the payload, so n8n does not translate `event`. (An interim HIGH-only rule was committed first and then replaced.)
- **Rule:** after editing an n8n workflow, publish it and re-test the production URL; a LINE push needs the `to` ID and the token from the same channel.
- **Vercel env vars need a Redeploy.** Adding or changing a variable (`N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `APP_URL`) changes nothing for the running deployment; only a new deployment reads it. The symptom is "works locally, no alert on prod". Rule: after editing a Vercel variable, Redeploy, then test on the production domain.
