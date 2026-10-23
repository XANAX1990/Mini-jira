import { SignInButtons } from "@/components/SignInButtons";
import { ThemeToggle } from "@/components/ThemeToggle";

// Static page: signed-in visitors are redirected to /projects by src/proxy.ts.
export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <h1 className="text-4xl font-semibold tracking-tight">Mini Jira</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        A lightweight issue tracker with a drag-and-drop Kanban board and per-project roles.
      </p>
      <SignInButtons />
    </main>
  );
}
