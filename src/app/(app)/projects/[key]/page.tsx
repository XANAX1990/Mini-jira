import Link from "next/link";
import { requireMember } from "@/lib/permissions";
import { listIssuesByStatus, listProjectMembers } from "@/lib/queries";
import { STATUSES } from "@/models/Issue";
import { CreateIssueForm } from "@/components/CreateIssueForm";
import { PriorityBadge, STATUS_LABELS, TypeBadge } from "@/components/IssueBadges";

// Temporary list view; Phase 5 replaces it with the drag & drop board.
export default async function BoardPage({ params }: PageProps<"/projects/[key]">) {
  const { key } = await params;
  const { project } = await requireMember(key);
  const [issues, members] = await Promise.all([
    listIssuesByStatus(project._id),
    listProjectMembers(project),
  ]);
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-6">
      <CreateIssueForm projectKey={project.key} members={members} />
      {STATUSES.map((status) => (
        <section key={status}>
          <h2 className="mb-2 text-sm font-medium text-zinc-500">
            {STATUS_LABELS[status]} ({issues[status].length})
          </h2>
          {issues[status].length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-700">
              No issues
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {issues[status].map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/projects/${project.key}/issues/${i.number}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span className="font-mono text-sm text-zinc-500">
                      {project.key}-{i.number}
                    </span>
                    <span className="flex-1">{i.title}</span>
                    <TypeBadge type={i.type} />
                    <PriorityBadge priority={i.priority} />
                    <span className="text-sm text-zinc-500">
                      {i.assigneeId ? (nameById.get(i.assigneeId) ?? "Former member") : "Unassigned"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
