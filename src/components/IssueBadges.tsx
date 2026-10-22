const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const TYPE_STYLES: Record<string, string> = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  bug: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const base = "rounded-full px-2 py-0.5 text-xs capitalize";

export function TypeBadge({ type }: { type: string }) {
  return <span className={`${base} ${TYPE_STYLES[type] ?? ""}`}>{type}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`${base} ${PRIORITY_STYLES[priority] ?? ""}`}>{priority}</span>;
}

export const STATUS_LABELS = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
} as const;
