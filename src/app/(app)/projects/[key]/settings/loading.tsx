// A new route segment needs a Suspense boundary of its own for instant navigation
// (the one in [key]/loading.tsx is already on screen when you click the Settings tab).
export default function Loading() {
  return <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>;
}
