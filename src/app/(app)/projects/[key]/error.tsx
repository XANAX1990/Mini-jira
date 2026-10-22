"use client";

import { RouteError } from "@/components/RouteError";

// Keeps the project header and tabs on screen when only the page below them fails.
export default function ProjectError({ reset }: { reset: () => void }) {
  return <RouteError reset={reset} />;
}
