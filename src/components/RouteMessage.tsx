import Link from "next/link";

/** Centered message used by the error / not-found pages of the project routes. */
export function RouteMessage({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
      <div className="flex items-center gap-4 text-sm">
        {action}
        <Link href="/projects" className="underline">
          Back to projects
        </Link>
      </div>
    </main>
  );
}
