import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/permissions";
import { listProjectMembers } from "@/lib/queries";
import { RenameForm } from "@/components/settings/RenameForm";
import { MembersSection } from "@/components/settings/MembersSection";
import { DeleteProject } from "@/components/settings/DeleteProject";

export default async function SettingsPage({ params }: PageProps<"/projects/[key]/settings">) {
  const { key } = await params;
  const admin = await requireAdmin(key);
  if (!admin.ok) notFound();
  const { project, user } = admin;
  const members = await listProjectMembers(project);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 p-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">General</h2>
        <RenameForm projectKey={project.key} name={project.name} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <MembersSection projectKey={project.key} members={members} currentUserId={user.id} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-red-600">Danger zone</h2>
        <DeleteProject projectKey={project.key} />
      </section>
    </main>
  );
}
