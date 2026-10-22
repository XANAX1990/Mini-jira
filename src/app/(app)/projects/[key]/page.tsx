import { requireMember } from "@/lib/permissions";
import { listIssuesByStatus, listProjectMembers } from "@/lib/queries";
import { Board } from "@/components/board/Board";

export default async function BoardPage({ params }: PageProps<"/projects/[key]">) {
  const { key } = await params;
  const { project } = await requireMember(key);
  const [issues, members] = await Promise.all([
    listIssuesByStatus(project._id),
    listProjectMembers(project),
  ]);

  return (
    <main className="flex-1 p-6">
      <Board projectKey={project.key} issues={issues} members={members} />
    </main>
  );
}
