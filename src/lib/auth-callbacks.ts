import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/User";

type SignInInput = {
  user: { email?: string | null };
  account?: { provider?: string } | null;
  profile?: { email_verified?: unknown } | null;
};

/**
 * Accounts are linked by email, so an email must be one the provider has vouched for.
 * Google says so in the `email_verified` claim and we require it to be exactly `true`.
 * (Auth.js' GitHub provider uses the primary email; GitHub only allows a verified one there.)
 */
export function isSignInAllowed({ user, account, profile }: SignInInput): boolean {
  if (!user.email) return false;
  if (account?.provider === "google") return profile?.email_verified === true;
  return true;
}

const DUPLICATE_KEY = 11000;

/**
 * One `users` document per lower-cased email, whichever provider signed in: GitHub and Google
 * with the same email give the same `_id`, so memberships and issues keep pointing at one user.
 * Returns the Mongo `_id` as a string.
 */
export async function upsertUser(input: {
  name?: string | null;
  email: string;
  image?: string | null;
}): Promise<string> {
  await connectDB();
  const email = input.email.trim().toLowerCase();
  const set: { name: string; image?: string } = { name: input.name?.trim() || email };
  if (input.image) set.image = input.image; // never blank out an avatar because one provider has none

  const run = () =>
    UserModel.findOneAndUpdate(
      { email },
      { $set: set, $setOnInsert: { email } },
      { upsert: true, returnDocument: "after" }
    );

  let doc;
  try {
    doc = await run();
  } catch (err) {
    // Two first sign-ins with the same email at once: one upsert loses the race on the unique
    // index. The document exists now, so the same call just updates it.
    if ((err as { code?: number }).code !== DUPLICATE_KEY) throw err;
    doc = await run();
  }
  if (!doc) throw new Error("Could not create or find the user");
  return doc._id.toString();
}
