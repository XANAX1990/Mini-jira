import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { fetchGitHubProfile } from "@/lib/github-profile";
import { googleEnabled } from "@/lib/providers";

// Provider/session config without Mongoose, kept separate from the callbacks in auth.ts.
// Google reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET by itself; it is only added when both exist.
export const authConfig = {
  providers: [
    // Same as the stock GitHub provider except that the email must be a verified one.
    GitHub({
      userinfo: {
        url: "https://api.github.com/user",
        request: ({ tokens }: { tokens: { access_token?: string } }) => fetchGitHubProfile(tokens.access_token),
      },
    }),
    ...(googleEnabled ? [Google] : []),
  ],
  trustHost: true,
  session: { strategy: "jwt" },
  // Errors come back to /login as ?error=... and the page shows a message.
  pages: { signIn: "/login", error: "/login" },
} satisfies NextAuthConfig;
