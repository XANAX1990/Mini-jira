import { SignInButton } from "@/components/SignInButton";

// Static page: signed-in visitors are redirected to /projects by src/proxy.ts.
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Sign in to Mini Jira</h1>
      <SignInButton />
    </main>
  );
}
