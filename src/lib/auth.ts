import NextAuth from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/User";
import { authConfig } from "./auth.config";

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ user }) {
      // GitHub accounts with no visible email can't be matched to a User.
      return !!user.email;
    },
    async jwt({ token, user }) {
      // `user` is only set on the sign-in request: upsert and keep the Mongo _id.
      if (user?.email) {
        await connectDB();
        const doc = await UserModel.findOneAndUpdate(
          { email: user.email.toLowerCase() },
          {
            $set: { name: user.name ?? user.email, image: user.image ?? undefined },
            $setOnInsert: { email: user.email.toLowerCase() },
          },
          { upsert: true, new: true }
        );
        token.id = doc._id.toString();
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
});

/** Server-side guard: returns the signed-in user or redirects to /login. */
export async function requireUser() {
  // Opt out of prerendering before Auth.js touches crypto (Cache Components).
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id, name, email, image } = session.user;
  return { id, name: name ?? email ?? "", email: email ?? "", image: image ?? null };
}
