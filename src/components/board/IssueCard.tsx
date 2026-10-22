"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar } from "@/components/Avatar";
import { PriorityBadge, TypeBadge } from "@/components/IssueBadges";
import type { IssueItem, MemberItem } from "@/lib/queries";

export const cardId = (number: number) => `i:${number}`;

const card =
  "rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

/** Card content, shared by the sortable card and the drag overlay. */
export function IssueCardView({
  projectKey,
  issue,
  assignee,
  interactive = true,
}: {
  projectKey: string;
  issue: IssueItem;
  assignee: MemberItem | undefined;
  interactive?: boolean;
}) {
  const body = (
    <>
      <span className="mb-1 block font-mono text-xs text-zinc-600 dark:text-zinc-400">
        {projectKey}-{issue.number}
      </span>
      <span className="mb-2 block text-sm">{issue.title}</span>
      <span className="flex items-center gap-2">
        <TypeBadge type={issue.type} />
        <PriorityBadge priority={issue.priority} />
        <span className="ml-auto">
          <Avatar member={assignee} />
        </span>
      </span>
    </>
  );
  return interactive ? (
    <Link href={`/projects/${projectKey}/issues/${issue.number}`} draggable={false} className="block">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

export function IssueCard({
  projectKey,
  issue,
  assignee,
}: {
  projectKey: string;
  issue: IssueItem;
  assignee: MemberItem | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardId(issue.number),
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${card} ${isDragging ? "opacity-40" : ""}`}
      {...attributes}
      {...listeners}
      // dnd-kit sets role="button", but the card contains a link: nested interactive roles are invalid.
      role="group"
      aria-label={`${projectKey}-${issue.number}: ${issue.title}`}
    >
      <IssueCardView projectKey={projectKey} issue={issue} assignee={assignee} />
    </div>
  );
}

export { card as cardStyle };
