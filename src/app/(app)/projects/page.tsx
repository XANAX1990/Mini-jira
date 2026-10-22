import { Suspense } from "react";
import { requireUser } from "@/lib/auth";

async function Welcome() {
  const user = await requireUser();
  return <p>Signed in as {user.email}. Projects arrive in Phase 3.</p>;
}

export default function ProjectsPage() {
  return (
    <main className="flex-1 p-6">
      <h1 className="mb-4 text-xl font-semibold">Projects</h1>
      <Suspense>
        <Welcome />
      </Suspense>
    </main>
  );
}
