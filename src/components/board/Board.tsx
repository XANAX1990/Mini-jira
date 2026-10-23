"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { moveIssue } from "@/actions/issues";
import { STATUSES, type Status } from "@/lib/issue-constants";
import type { IssueItem, MemberItem } from "@/lib/queries";
import { useToast } from "@/components/Toast";
import { Column } from "@/components/board/Column";
import { IssueCardView, cardStyle } from "@/components/board/IssueCard";

type Columns = Record<Status, IssueItem[]>;
type Move = { number: number; status: Status; index: number };

const numberOf = (id: string | number) => Number(String(id).slice(2));

/** Show the card in its new place right away; the server result replaces this. */
function applyMove(columns: Columns, move: Move): Columns {
  const moving = STATUSES.flatMap((s) => columns[s]).find((i) => i.number === move.number);
  if (!moving) return columns;
  const next = Object.fromEntries(
    STATUSES.map((s) => [s, columns[s].filter((i) => i.number !== move.number)])
  ) as Columns;
  next[move.status].splice(move.index, 0, { ...moving, status: move.status });
  return next;
}

export function Board({
  projectKey,
  issues,
  members,
  filtered,
}: {
  projectKey: string;
  issues: Columns;
  members: MemberItem[];
  /** True when the URL filters are narrowing the board. */
  filtered: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [columns, applyOptimistic] = useOptimistic(issues, applyMove);
  const [activeNumber, setActiveNumber] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Touch starts only from a card's handle (see IssueCard), which has touch-action: none.
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }),
    // Space lifts a focused card; Enter stays free for the link inside it.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  const statusOf = (id: string | number): Status | null => {
    const s = String(id);
    if (s.startsWith("col:")) return s.slice(4) as Status;
    const n = numberOf(s);
    return STATUSES.find((st) => columns[st].some((i) => i.number === n)) ?? null;
  };

  function onDragStart(e: DragStartEvent) {
    setActiveNumber(numberOf(e.active.id));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveNumber(null);
    if (!over) return;
    const from = statusOf(active.id);
    const to = statusOf(over.id);
    if (!from || !to) return;

    const number = numberOf(active.id);
    const oldIndex = columns[from].findIndex((i) => i.number === number);
    const target = columns[to].filter((i) => i.number !== number);

    let index: number;
    if (String(over.id).startsWith("col:")) {
      index = target.length;
    } else {
      const overNumber = numberOf(over.id);
      const overIndex = target.findIndex((i) => i.number === overNumber);
      if (overIndex === -1) return; // dropped on itself
      if (from === to) {
        const overFull = columns[to].findIndex((i) => i.number === overNumber);
        index = oldIndex < overFull ? overIndex + 1 : overIndex;
      } else {
        const translated = active.rect.current.translated;
        const below = !!translated && translated.top > over.rect.top + over.rect.height / 2;
        index = below ? overIndex + 1 : overIndex;
      }
    }
    if (from === to && index === oldIndex) return;

    const beforeNumber = target[index - 1]?.number;
    const afterNumber = target[index]?.number;

    startTransition(async () => {
      applyOptimistic({ number, status: to, index });
      const res = await moveIssue(projectKey, number, { status: to, beforeNumber, afterNumber });
      if (!res.ok) {
        // The optimistic state rolls back when the transition ends; refresh to get the truth.
        toast(`Couldn't move ${projectKey}-${number}: ${res.error}`, "error");
        router.refresh();
      }
    });
  }

  const active = activeNumber
    ? STATUSES.flatMap((s) => columns[s]).find((i) => i.number === activeNumber)
    : undefined;

  if (filtered && STATUSES.every((s) => columns[s].length === 0)) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <p className="mb-2">No issues match your filters.</p>
        <Link href={`/projects/${projectKey}`} className="underline">
          Clear filters
        </Link>
      </div>
    );
  }

  return (
    <DndContext
      id="board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveNumber(null)}
    >
      {/* Phones: columns scroll sideways and snap; from md up they sit side by side. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {STATUSES.map((status) => (
          <Column
            key={status}
            projectKey={projectKey}
            status={status}
            issues={columns[status]}
            membersById={membersById}
          />
        ))}
      </div>
      <DragOverlay>
        {active && (
          // dnd-kit measures the overlay's first child, transforms included. The tilt therefore lives
          // one level down: tilting the measured element moves its box by about 1px, and the keyboard
          // sensor then counts the card below as "to the right" (first arrow press went down, not right).
          <div>
            <div className={`${cardStyle} rotate-1 shadow-lg`}>
              <IssueCardView
                projectKey={projectKey}
                issue={active}
                assignee={active.assigneeId ? membersById.get(active.assigneeId) : undefined}
                interactive={false}
              />
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
