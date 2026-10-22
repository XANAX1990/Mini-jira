"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
}: {
  projectKey: string;
  issues: Columns;
  members: MemberItem[];
}) {
  const router = useRouter();
  const [columns, applyOptimistic] = useOptimistic(issues, applyMove);
  const [activeNumber, setActiveNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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
        setError(`Couldn't move ${projectKey}-${number}: ${res.error}`);
        router.refresh();
      }
    });
  }

  const active = activeNumber
    ? STATUSES.flatMap((s) => columns[s]).find((i) => i.number === activeNumber)
    : undefined;

  return (
    <>
      <DndContext
        id="board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveNumber(null)}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {STATUSES.map((status) => (
            <Column
              key={status}
              projectKey={projectKey}
              status={status}
              issues={columns[status]}
              membersById={membersById}
              onError={setError}
            />
          ))}
        </div>
        <DragOverlay>
          {active && (
            <div className={`${cardStyle} rotate-1 shadow-lg`}>
              <IssueCardView
                projectKey={projectKey}
                issue={active}
                assignee={active.assigneeId ? membersById.get(active.assigneeId) : undefined}
                interactive={false}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {error && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-md bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="font-bold">
            ×
          </button>
        </div>
      )}
    </>
  );
}
