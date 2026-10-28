"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FILTER_KEYS } from "@/lib/board-filters";
import { PRIORITIES, TYPES } from "@/lib/issue-constants";
import type { MemberItem } from "@/lib/queries";

const field =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

/** Filter state lives in the URL, so it survives a refresh and can be shared. */
export function FilterBar({
  members,
  children,
}: {
  members: MemberItem[];
  /** Sits at the end of the row (the page puts the Add issue button here). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const urlQ = params.get("q") ?? "";
  const [text, setText] = useState(urlQ);
  const lastPushed = useRef(urlQ);

  function push(next: URLSearchParams) {
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  // Debounce typing, but keep the box in step when the URL changes some other way (Back, Clear).
  useEffect(() => {
    if (urlQ !== lastPushed.current) {
      lastPushed.current = urlQ;
      setText(urlQ);
    }
  }, [urlQ]);

  useEffect(() => {
    const value = text.trim();
    if (value === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = value;
      setParam("q", value);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const active = FILTER_KEYS.some((k) => params.has(k));

  return (
    <div
      role="search"
      aria-busy={pending}
      className="mb-4 flex flex-wrap items-center gap-3"
    >
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search titles…"
        aria-label="Search titles"
        maxLength={100}
        className={`${field} min-w-0 basis-full sm:basis-auto sm:flex-1 sm:max-w-xs`}
      />
      <select
        value={params.get("assignee") ?? ""}
        onChange={(e) => setParam("assignee", e.target.value)}
        aria-label="Assignee"
        className={field}
      >
        <option value="">All assignees</option>
        <option value="me">Me</option>
        <option value="none">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        value={params.get("type") ?? ""}
        onChange={(e) => setParam("type", e.target.value)}
        aria-label="Type"
        className={`${field} capitalize`}
      >
        <option value="">All types</option>
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        value={params.get("priority") ?? ""}
        onChange={(e) => setParam("priority", e.target.value)}
        aria-label="Priority"
        className={`${field} capitalize`}
      >
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {active && (
        <button
          type="button"
          onClick={() => {
            lastPushed.current = "";
            setText("");
            push(new URLSearchParams());
          }}
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          Clear filters
        </button>
      )}
      {children}
    </div>
  );
}
