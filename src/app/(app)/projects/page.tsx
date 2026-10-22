import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMyProjects } from "@/lib/queries";
import { CreateProjectForm } from "@/components/CreateProjectForm";

async function ProjectList() {
  const user = await requireUser();
  const projects = await listMyProjects(user.id);

  if (projects.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        You are not in any project yet. Create your first one above.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {projects.map((p) => (
        <li key={p.id}>
          <Link
            href={`/projects/${p.key}`}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            <span className="font-medium">{p.name}</span>
            <span className="flex items-center gap-3 text-sm text-zinc-500">
              <span className="font-mono">{p.key}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize dark:bg-zinc-800">
                {p.role}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ProjectsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
      <h1 className="text-xl font-semibold">Projects</h1>
      <CreateProjectForm />
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <ProjectList />
      </Suspense>
    </main>
  );
}
