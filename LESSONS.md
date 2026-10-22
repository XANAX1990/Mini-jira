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
