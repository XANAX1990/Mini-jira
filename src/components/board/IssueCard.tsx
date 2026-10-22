"use client";

import { useRef } from "react";
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
  const handleRef = useRef<HTMLSpanElement>(null);

  // Mouse and keyboard can grab the whole card, but a finger only drags by the handle:
  // the rest of the card must stay free so a swipe scrolls the board instead of fighting the drag.
  const { onTouchStart, ...otherListeners } = listeners ?? {};

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${card} relative select-none [-webkit-touch-callout:none] ${isDragging ? "opacity-40" : ""}`}
      {...attributes}
      {...otherListeners}
      onTouchStart={(e) => {
        if (handleRef.current?.contains(e.target as Node)) (onTouchStart as (e: React.TouchEvent) => void)?.(e);
      }}
      // dnd-kit sets role="button", but the card contains a link: nested interactive roles are invalid.
      role="group"
      aria-label={`${projectKey}-${issue.number}: ${issue.title}`}
    >
      <IssueCardView projectKey={projectKey} issue={issue} assignee={assignee} />
      <span
        ref={handleRef}
        aria-hidden="true"
        title="Drag to move"
        className="absolute top-0 right-0 flex h-9 w-9 cursor-grab touch-none items-center justify-center text-zinc-600 dark:text-zinc-400"
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
          {[3, 8, 13].flatMap((y) => [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}
        </svg>
      </span>
    </div>
  );
}

export { card as cardStyle };
