import { Suspense } from "react";
import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <Suspense fallback={<div className="h-[53px] border-b border-zinc-200 dark:border-zinc-800" />}>
        <Header />
      </Suspense>
      {children}
    </ToastProvider>
  );
}
