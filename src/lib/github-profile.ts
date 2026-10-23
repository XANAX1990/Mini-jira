import type { Profile } from "next-auth";

// Accounts are linked by email (see auth-callbacks.ts), so the email we take from GitHub has to be
// one GitHub has verified. Auth.js' own GitHub provider takes `primary ?? emails[0]` without looking
// at `verified`. This is the same lookup with that one gap closed.

type GitHubEmail = { email?: unknown; primary?: unknown; verified?: unknown };

/** The primary verified email, else the first verified one, else nothing. */
export function pickVerifiedEmail(emails: unknown): string | undefined {
  if (!Array.isArray(emails)) return undefined;
  const verified = (emails as GitHubEmail[]).filter(
    (e): e is { email: string; primary?: unknown; verified: true } =>
      !!e && e.verified === true && typeof e.email === "string" && e.email.length > 0
  );
  return (verified.find((e) => e.primary === true) ?? verified[0])?.email;
}

/**
 * Same behavior as Auth.js' GitHub provider: use the email on the public profile if there is one
 * (GitHub only lets a verified address be made public), otherwise ask `/user/emails`, which the
 * default `user:email` scope allows. Anything without a verified email ends up with no email,
 * and `isSignInAllowed` refuses it.
 */
export async function fetchGitHubProfile(
  accessToken: string | undefined,
  fetchFn: typeof fetch = fetch
): Promise<Profile> {
  const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": "authjs" };
  const profile = await fetchFn("https://api.github.com/user", { headers }).then((res) => res.json());
  if (!profile.email) {
    const res = await fetchFn("https://api.github.com/user/emails", { headers });
    if (res.ok) profile.email = pickVerifiedEmail(await res.json());
  }
  return profile as unknown as Profile;
}
