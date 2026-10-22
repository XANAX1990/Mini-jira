"use client";

import { useSearchParams } from "next/navigation";

// Auth.js sends failed sign-ins back to /login?error=<code>.
const MESSAGES: Record<string, string> = {
  AccessDenied:
    "That account can't sign in. It needs an email address, and a Google account's email must be verified.",
};
const DEFAULT_MESSAGE = "Sign-in didn't work. Please try again.";

export function AuthErrorNotice() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return (
    <p
      role="alert"
      className="w-full max-w-xs rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {MESSAGES[error] ?? DEFAULT_MESSAGE}
    </p>
  );
}
