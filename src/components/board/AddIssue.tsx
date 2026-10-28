"use client";

import { useId, useRef, useState, useTransition } from "react";
import { createIssue } from "@/actions/issues";
import { STATUS_LABELS } from "@/components/IssueBadges";
import { useToast } from "@/components/Toast";
import { PRIORITIES, STATUSES, TYPES, type Status } from "@/lib/issue-constants";
import type { MemberItem } from "@/lib/queries";

const field =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const label = "flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400";

/**
 * "Add issue" button plus the modal it opens. Built on the native <dialog>: showModal() makes the
 * rest of the page inert, traps Tab, and closes on Esc; closing hands focus back to the opener.
 * The create runs once with every chosen field (see createIssue), so one new issue is one alert.
 */
export function AddIssue({
  projectKey,
  members,
  status = "todo",
  variant,
}: {
  projectKey: string;
  members: MemberItem[];
  /** The column the dialog was opened from; preselected in the Status field. */
  status?: Status;
  variant: "button" | "icon";
}) {
  const toast = useToast();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    dialogRef.current?.showModal();
    titleRef.current?.focus();
  }

  // Runs for every way of closing: Esc, Cancel, a click on the backdrop, or a successful create.
  function onClose() {
    formRef.current?.reset();
    setError(null);
    openerRef.current?.focus();
  }

  // Not <form action>: React would clear the fields after the action even when the server says
  // no, and the person would lose what they typed.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const assignee = String(data.get("assigneeId") ?? "");
    setError(null);
    startTransition(async () => {
      const res = await createIssue(projectKey, {
        title: data.get("title"),
        description: data.get("description"),
        type: data.get("type"),
        priority: data.get("priority"),
        status: data.get("status"),
        assigneeId: assignee === "" ? null : assignee,
      });
      if (res.ok) {
        dialogRef.current?.close();
        toast(`${projectKey}-${res.data.number} created`);
      } else setError(res.error);
    });
  }

  return (
    <>
      {variant === "button" ? (
        <button
          ref={openerRef}
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:ml-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add issue
        </button>
      ) : (
        <button
          ref={openerRef}
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          aria-label={`Add issue to ${STATUS_LABELS[status]}`}
          className="flex h-6 w-6 items-center justify-center rounded text-base leading-none text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          +
        </button>
      )}

      {/* No display utility on <dialog> itself: it would override the closed state's display: none. */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={onClose}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4 p-5">
          <h2 id={titleId} className="text-lg font-semibold">
            New issue
          </h2>
          <label className={label}>
            Title
            <input
              ref={titleRef}
              name="title"
              required
              maxLength={200}
              placeholder="What needs to be done?"
              className={`${field} text-sm text-zinc-900 dark:text-zinc-100`}
            />
          </label>
          <label className={label}>
            Description
            <textarea
              name="description"
              rows={4}
              maxLength={10000}
              className={`${field} text-zinc-900 dark:text-zinc-100`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Status
              <select name="status" defaultValue={status} className={field}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Type
              <select name="type" defaultValue="task" className={`${field} capitalize`}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Priority
              <select name="priority" defaultValue="medium" className={`${field} capitalize`}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Assignee
              <select name="assigneeId" defaultValue="" className={field}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
