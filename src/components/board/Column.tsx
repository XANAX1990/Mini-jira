"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUS_LABELS } from "@/components/IssueBadges";
import { IssueCard, cardId } from "@/components/board/IssueCard";
import { QuickAdd } from "@/components/board/QuickAdd";
import type { Status } from "@/lib/issue-constants";
import type { IssueItem, MemberItem } from "@/lib/queries";

export const columnId = (status: Status) => `col:${status}`;

export function Column({
  projectKey,
  status,
  issues,
  membersById,
  onError,
}: {
  projectKey: string;
  status: Status;
  issues: IssueItem[];
  membersById: Map<string, MemberItem>;
  onError: (message: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });

  return (
    <section
      aria-label={STATUS_LABELS[status]}
      className="flex min-w-0 flex-col rounded-lg bg-zinc-100 p-3 dark:bg-zinc-950"
    >
      <h2 className="mb-3 flex items-center justify-between text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {STATUS_LABELS[status]}
        <span className="rounded-full bg-zinc-200 px-2 text-xs dark:bg-zinc-800">{issues.length}</span>
      </h2>
      {status === "todo" && (
        <div className="mb-3">
          <QuickAdd projectKey={projectKey} onError={onError} />
        </div>
      )}
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
            <p className="rounded-md border border-dashed border-zinc-300 p-3 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No issues
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}
