"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUS_LABELS } from "@/components/IssueBadges";
import { IssueCard, cardId } from "@/components/board/IssueCard";
import { AddIssue } from "@/components/board/AddIssue";
import type { Status } from "@/lib/issue-constants";
import type { IssueItem, MemberItem } from "@/lib/queries";

export const columnId = (status: Status) => `col:${status}`;

export function Column({
  projectKey,
  status,
  issues,
  members,
  membersById,
}: {
  projectKey: string;
  status: Status;
  issues: IssueItem[];
  members: MemberItem[];
  membersById: Map<string, MemberItem>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });

  return (
    <section
      aria-label={STATUS_LABELS[status]}
      className="flex w-[85%] shrink-0 snap-start flex-col rounded-lg bg-zinc-100 p-3 md:w-auto md:min-w-0 md:shrink dark:bg-zinc-950"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {STATUS_LABELS[status]}
          <span className="rounded-full bg-zinc-200 px-2 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">{issues.length}</span>
        </h2>
        <AddIssue projectKey={projectKey} members={members} status={status} variant="icon" />
      </div>
      <SortableContext items={issues.map((i) => cardId(i.number))} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex min-h-24 flex-1 flex-col gap-2 rounded-md ${
            isOver ? "bg-zinc-200/60 dark:bg-zinc-900" : ""
          }`}
        >
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              projectKey={projectKey}
              issue={issue}
              assignee={issue.assigneeId ? membersById.get(issue.assigneeId) : undefined}
            />
          ))}
          {issues.length === 0 && (
            <p className="rounded-md border border-dashed border-zinc-300 p-3 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              No issues
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}
