import { requireUser, signOut } from "@/lib/auth";

export async function Header() {
  const user = await requireUser();

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
      <span className="font-semibold">Mini Jira</span>
      <div className="flex items-center gap-3 text-sm">
        {user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-7 w-7 rounded-full" />
        )}
        <span>{user.name}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-zinc-500 hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
