import { signInWithGitHub, signInWithGoogle } from "@/actions/auth";
import { googleEnabled } from "@/lib/providers";

const button =
  "w-full rounded-md px-4 py-2 text-sm font-medium transition-colors";

export function SignInButtons() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <form action={signInWithGitHub}>
        <button
          type="submit"
          className={`${button} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`}
        >
          Sign in with GitHub
        </button>
      </form>
      {googleEnabled && (
        <form action={signInWithGoogle}>
          <button
            type="submit"
            className={`${button} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}
          >
            Sign in with Google
          </button>
        </form>
      )}
    </div>
  );
}
