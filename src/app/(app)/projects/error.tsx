"use client";

import { RouteError } from "@/components/RouteError";

export default function ProjectsError({ reset }: { reset: () => void }) {
  return <RouteError reset={reset} />;
}
