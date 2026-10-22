import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SignInButton } from "@/components/SignInButton";

async function SignedOutCta() {
  const session = await getSession();
  if (session?.user) redirect("/projects");
  return <SignInButton />;
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Mini Jira</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        A lightweight issue tracker with a drag-and-drop Kanban board and per-project roles.
      </p>
      <Suspense fallback={<div className="h-9" />}>
        <SignedOutCta />
      </Suspense>
    </main>
  );
}
