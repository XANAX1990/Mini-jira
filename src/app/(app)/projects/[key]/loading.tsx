// Also gives every page under /projects/[key] its own Suspense boundary, which
// Cache Components needs for instant navigation between Board / Issue / Settings.
export default function Loading() {
  return <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>;
}
