import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { signOutAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

export async function Header() {
  const user = await requireUser();

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 md:px-6 dark:border-zinc-800">
      <Link href="/projects" className="font-semibold">
        Mini Jira
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <ThemeToggle />
        {user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-7 w-7 rounded-full" />
        )}
        <span className="hidden sm:inline">{user.name}</span>
        <form action={signOutAction}>
          <button type="submit" className="text-zinc-600 hover:underline dark:text-zinc-400">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
