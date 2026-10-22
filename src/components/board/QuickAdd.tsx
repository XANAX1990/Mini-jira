"use client";

import { useState, useTransition } from "react";
import { createIssue } from "@/actions/issues";

export function QuickAdd({
  projectKey,
  onError,
}: {
  projectKey: string;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const title = String(formData.get("title") ?? "");
    startTransition(async () => {
      const res = await createIssue(projectKey, { title });
      if (res.ok) setOpen(false);
      else onError(res.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
      >
        + Add issue
      </button>
    );
  }

  return (
    <form action={onSubmit} className="space-y-2">
      <input
        name="title"
        autoFocus
        required
        maxLength={200}
        placeholder="What needs to be done?"
        aria-label="Issue title"
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
