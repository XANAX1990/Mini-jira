"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteIssue, updateIssue } from "@/actions/issues";
import { PRIORITIES, STATUSES, TYPES } from "@/lib/issue-constants";
import { STATUS_LABELS } from "@/components/IssueBadges";
import { useToast } from "@/components/Toast";
import type { IssueItem, MemberItem } from "@/lib/queries";

const field =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function IssueForm({
  projectKey,
  issue,
  members,
  canDelete,
}: {
  projectKey: string;
  issue: IssueItem;
  members: MemberItem[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onSave(formData: FormData) {
    const assignee = String(formData.get("assigneeId") ?? "");
    startTransition(async () => {
      const res = await updateIssue(projectKey, issue.number, {
        title: formData.get("title"),
        description: formData.get("description"),
        type: formData.get("type"),
        priority: formData.get("priority"),
        status: formData.get("status"),
        assigneeId: assignee === "" ? null : assignee,
      });
      if (res.ok) toast("Saved");
      else toast(res.error, "error");
    });
  }

  function onDelete() {
    if (!window.confirm(`Delete ${projectKey}-${issue.number}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteIssue(projectKey, issue.number);
      if (res.ok) {
        toast(`${projectKey}-${issue.number} deleted`);
        router.push(`/projects/${projectKey}`);
      } else toast(res.error, "error");
    });
  }

  return (
    <div className="space-y-4">
      <form action={onSave} className="space-y-4">
        <input
          name="title"
          defaultValue={issue.title}
          required
          maxLength={200}
          aria-label="Title"
          className={`${field} w-full text-lg font-medium`}
        />
        <textarea
          name="description"
          defaultValue={issue.description}
          rows={6}
          maxLength={10000}
          aria-label="Description"
          placeholder="Description"
          className={`${field} w-full`}
        />
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Status
            <select name="status" defaultValue={issue.status} className={field}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Type
            <select name="type" defaultValue={issue.type} className={`${field} capitalize`}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Priority
            <select name="priority" defaultValue={issue.priority} className={`${field} capitalize`}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Assignee
            <select name="assigneeId" defaultValue={issue.assigneeId ?? ""} className={field}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {canDelete && (
        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            Delete issue
          </button>
        </div>
      )}
    </div>
  );
}
