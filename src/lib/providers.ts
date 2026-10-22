// Which sign-in providers are switched on. Plain module (no Auth.js, no secrets) so the
// static landing and login pages can read it too. Evaluated at build time for those pages.
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
