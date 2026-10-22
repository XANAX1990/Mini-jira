"use client";

import { useTransition } from "react";
import { renameProject } from "@/actions/projects";
import { useToast } from "@/components/Toast";

export function RenameForm({ projectKey, name }: { projectKey: string; name: string }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await renameProject(projectKey, formData.get("name"));
      if (res.ok) toast("Project renamed");
      else toast(res.error, "error");
    });
  }

  return (
    <form action={onSubmit} className="flex flex-wrap items-center gap-3">
      <input
        name="name"
        defaultValue={name}
        required
        maxLength={80}
        aria-label="Project name"
        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Rename"}
      </button>
    </form>
  );
}
