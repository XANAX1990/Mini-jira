import { Suspense } from "react";
import { Header } from "@/components/Header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={<div className="h-[53px] border-b border-zinc-200 dark:border-zinc-800" />}>
        <Header />
      </Suspense>
      {children}
    </>
  );
}
