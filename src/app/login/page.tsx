import { Suspense } from "react";
import { AuthErrorNotice } from "@/components/AuthErrorNotice";
import { SignInButtons } from "@/components/SignInButtons";

// Static page: signed-in visitors are redirected to /projects by src/proxy.ts.
// Only the error notice reads the URL, in the browser, so the page itself stays static.
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Sign in to Mini Jira</h1>
      <Suspense fallback={null}>
        <AuthErrorNotice />
      </Suspense>
      <SignInButtons />
    </main>
  );
}
