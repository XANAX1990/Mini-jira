// Plain constants (no Mongoose) so Client Components can import them.
export const STATUSES = ["todo", "in_progress", "done"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const TYPES = ["task", "bug"] as const;

export type Status = (typeof STATUSES)[number];
