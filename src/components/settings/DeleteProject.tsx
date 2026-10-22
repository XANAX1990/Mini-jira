"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProject } from "@/actions/projects";
import { useToast } from "@/components/Toast";

export function DeleteProject({ projectKey }: { projectKey: string }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      const res = await deleteProject(projectKey, typed);
      if (res.ok) {
        toast(`Project ${projectKey} deleted`);
        router.push("/projects");
      } else toast(res.error, "error");
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-red-300 p-4 dark:border-red-900">
      <p className="text-sm">
        Deleting the project also deletes all of its issues. This cannot be undone. Type{" "}
        <span className="font-mono font-medium">{projectKey}</span> to confirm.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Type the project key to confirm"
          placeholder={projectKey}
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        <button
          type="button"
          onClick={onDelete}
          disabled={pending || typed.trim().toUpperCase() !== projectKey}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete project"}
        </button>
      </div>
    </div>
  );
}
