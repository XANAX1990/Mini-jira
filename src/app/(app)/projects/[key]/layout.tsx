import { Suspense } from "react";
import Link from "next/link";
import { requireMember } from "@/lib/permissions";

async function ProjectShell({
  params,
  children,
}: {
  params: LayoutProps<"/projects/[key]">["params"];
  children: React.ReactNode;
}) {
  const { key } = await params;
  const { project, role } = await requireMember(key);
  const tab = "rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-zinc-200 px-4 pt-4 md:px-6 dark:border-zinc-800">
        <h1 className="flex items-baseline gap-3 text-xl font-semibold">
          {project.name}
          <span className="font-mono text-sm font-normal text-zinc-600 dark:text-zinc-400">{project.key}</span>
        </h1>
        <nav className="-mx-3 mt-3 flex gap-1 pb-2">
          <Link href={`/projects/${project.key}`} className={tab}>
            Board
          </Link>
          {role === "admin" && (
            <Link href={`/projects/${project.key}/settings`} className={tab}>
              Settings
            </Link>
          )}
        </nav>
      </div>
      {children}
    </div>
  );
}

export default function ProjectLayout({ params, children }: LayoutProps<"/projects/[key]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>}>
      <ProjectShell params={params}>{children}</ProjectShell>
    </Suspense>
  );
}
