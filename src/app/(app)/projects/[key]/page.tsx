import { requireMember } from "@/lib/permissions";
import { listIssuesByStatus, listProjectMembers } from "@/lib/queries";
import { hasFilters, parseBoardFilters } from "@/lib/board-filters";
import { AddIssue } from "@/components/board/AddIssue";
import { Board } from "@/components/board/Board";
import { FilterBar } from "@/components/board/FilterBar";

export default async function BoardPage({ params, searchParams }: PageProps<"/projects/[key]">) {
  const [{ key }, query] = await Promise.all([params, searchParams]);
  const { project, user } = await requireMember(key);
  const filters = parseBoardFilters(query);
  const [issues, members] = await Promise.all([
    listIssuesByStatus(project._id, filters, user.id),
    listProjectMembers(project),
  ]);

  return (
    <main className="flex-1 p-4 md:p-6">
      <FilterBar members={members}>
        <AddIssue projectKey={project.key} members={members} variant="button" />
      </FilterBar>
      <Board
        projectKey={project.key}
        issues={issues}
        members={members}
        filtered={hasFilters(filters)}
      />
    </main>
  );
}
