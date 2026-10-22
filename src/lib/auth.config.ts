import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

// Provider/session config without Mongoose, kept separate from the callbacks in auth.ts.
export const authConfig = {
  providers: [GitHub],
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
} satisfies NextAuthConfig;
