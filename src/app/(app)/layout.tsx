import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
