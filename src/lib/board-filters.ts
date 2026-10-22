import { z } from "zod";
import { PRIORITIES, TYPES } from "@/lib/issue-constants";

// Plain module (no Mongoose): the server page parses the URL, the filter bar builds it.

export type BoardFilters = {
  /** "me", "none" (unassigned) or a member id */
  assignee?: string;
  type?: (typeof TYPES)[number];
  priority?: (typeof PRIORITIES)[number];
  q?: string;
};

export const FILTER_KEYS = ["assignee", "type", "priority", "q"] as const;

const schemas = {
  assignee: z.union([z.enum(["me", "none"]), z.string().regex(/^[a-f0-9]{24}$/i)]),
  type: z.enum(TYPES),
  priority: z.enum(PRIORITIES),
  q: z.string().trim().min(1).max(100),
};

/** Reads the query string; anything invalid is ignored rather than failing the page. */
export function parseBoardFilters(
  searchParams: Record<string, string | string[] | undefined>
): BoardFilters {
  const out: BoardFilters = {};
  for (const key of FILTER_KEYS) {
    const raw = searchParams[key];
    const parsed = schemas[key].safeParse(Array.isArray(raw) ? raw[0] : raw);
    if (parsed.success) (out as Record<string, string>)[key] = parsed.data;
  }
  return out;
}

export const hasFilters = (f: BoardFilters) => Object.keys(f).length > 0;
