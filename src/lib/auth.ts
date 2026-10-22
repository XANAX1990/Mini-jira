import NextAuth from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSignInAllowed, upsertUser } from "@/lib/auth-callbacks";
import { authConfig } from "./auth.config";

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ user, account, profile }) {
      return isSignInAllowed({ user, account, profile });
    },
    async jwt({ token, user }) {
      // `user` is only set on the sign-in request: upsert by email and keep the Mongo _id.
      if (user?.email) {
        token.id = await upsertUser({ name: user.name ?? user.email, email: user.email, image: user.image });
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
});

/**
 * The current session, or null. Pages and components must call this instead of `auth()`:
 * with Cache Components, Auth.js touches crypto before it reads any request data, so
 * it has to run after `connection()` (and inside a <Suspense> boundary).
 */
export async function getSession() {
  await connection();
  return auth();
}

/** Server-side guard: returns the signed-in user or redirects to /login. */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  const { id, name, email, image } = session.user;
  return { id, name: name ?? email ?? "", email: email ?? "", image: image ?? null };
}
