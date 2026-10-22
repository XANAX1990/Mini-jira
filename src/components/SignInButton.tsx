import { signInWithGitHub } from "@/actions/auth";

export function SignInButton() {
  return (
    <form action={signInWithGitHub}>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Sign in with GitHub
      </button>
    </form>
  );
}
