import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInButton } from "@/components/SignInButton";

async function LoginForm() {
  const session = await auth();
  if (session?.user) redirect("/projects");
  return <SignInButton />;
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Sign in to Mini Jira</h1>
      <Suspense fallback={<div className="h-9" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
