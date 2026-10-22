import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

// Edge-safe config (no Mongoose): shared by src/lib/auth.ts and src/proxy.ts.
export const authConfig = {
  providers: [GitHub],
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      if (request.nextUrl.pathname.startsWith("/projects")) return !!auth?.user;
      return true;
    },
  },
} satisfies NextAuthConfig;
