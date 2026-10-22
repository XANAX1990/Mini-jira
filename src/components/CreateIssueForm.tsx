"use client";

import { useRef, useState, useTransition } from "react";
import { createIssue } from "@/actions/issues";
import { PRIORITIES, TYPES } from "@/lib/issue-constants";
import type { MemberItem } from "@/lib/queries";

const field =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function CreateIssueForm({
  projectKey,
  members,
}: {
  projectKey: string;
  members: MemberItem[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const assignee = String(formData.get("assigneeId") ?? "");
    startTransition(async () => {
      const res = await createIssue(projectKey, {
        title: formData.get("title"),
        description: formData.get("description"),
        type: formData.get("type"),
        priority: formData.get("priority"),
        assigneeId: assignee === "" ? null : assignee,
      });
      if (res.ok) {
        setError(null);
        formRef.current?.reset();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <h2 className="text-sm font-medium">New issue</h2>
      <input name="title" placeholder="Title" required maxLength={200} className={`${field} w-full`} />
      <textarea
        name="description"
        placeholder="Description (optional)"
        rows={2}
        maxLength={10000}
        className={`${field} w-full`}
      />
      <div className="flex flex-wrap gap-3">
        <select name="type" defaultValue="task" className={`${field} capitalize`} aria-label="Type">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue="medium"
          className={`${field} capitalize`}
          aria-label="Priority"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select name="assigneeId" defaultValue="" className={field} aria-label="Assignee">
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Creating…" : "Create issue"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
