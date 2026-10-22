import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/permissions";

export default async function SettingsPage({ params }: PageProps<"/projects/[key]/settings">) {
  const { key } = await params;
  const admin = await requireAdmin(key);
  if (!admin.ok) notFound();

  return (
    <main className="flex-1 p-6 text-sm text-zinc-500">
      Project settings arrive in Phase 6.
    </main>
  );
}
