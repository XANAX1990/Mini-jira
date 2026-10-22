import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/permissions";
import { getIssue, listProjectMembers } from "@/lib/queries";
import { IssueForm } from "@/components/IssueForm";

export default async function IssuePage({
  params,
}: PageProps<"/projects/[key]/issues/[number]">) {
  const { key, number } = await params;
  const { project, role } = await requireMember(key);

  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  const [issue, members] = await Promise.all([
    getIssue(project._id, n),
    listProjectMembers(project),
  ]);
  if (!issue) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-6">
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <Link href={`/projects/${project.key}`} className="hover:underline">
          ← Board
        </Link>
        <span className="font-mono">
          {project.key}-{issue.number}
        </span>
      </div>
      <IssueForm
        projectKey={project.key}
        issue={issue}
        members={members}
        canDelete={role === "admin"}
      />
    </main>
  );
}
