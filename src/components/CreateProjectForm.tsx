"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProject } from "@/actions/projects";

const input =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function CreateProjectForm() {
  const [state, action, pending] = useActionState(createProject, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <input name="name" placeholder="Project name" required maxLength={80} className={`${input} flex-1`} />
      <input
        name="key"
        placeholder="KEY"
        required
        maxLength={6}
        pattern="[A-Za-z]{2,6}"
        title="2–6 letters"
        className={`${input} w-28 uppercase`}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600 sm:basis-full">
          {state.error}
        </p>
      )}
    </form>
  );
}
