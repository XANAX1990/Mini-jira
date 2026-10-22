"use client";

import { RouteMessage } from "@/components/RouteMessage";

export function RouteError({ reset }: { reset: () => void }) {
  return (
    <RouteMessage
      title="Something went wrong"
      text="The page could not be loaded. Try again, and if it keeps happening come back later."
      action={
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Try again
        </button>
      }
    />
  );
}
