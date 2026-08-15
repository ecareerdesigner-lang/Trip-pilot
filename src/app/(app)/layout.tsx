import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

/**
 * Everything under this layout requires a session.
 *
 * Guarding here rather than in each page means a new route is protected by
 * default. Individual routes still call `requireUser()`, because a layout is
 * not a security boundary for route handlers or server actions.
 *
 * `dynamic = "force-dynamic"` matters as much as the guard above it. Next.js
 * tries to statically prerender a page by default, which runs this layout
 * with no request and no cookies — there is no user to find, so
 * `getCurrentUser()` correctly returns null. Without this line the build
 * does not gracefully skip that page; it fails, because a page underneath
 * (dashboard, settings, trips) calls `requireUser()` directly and that
 * throws rather than redirecting. Applied on the layout, this propagates to
 * every nested route automatically — one line protects pages not written
 * yet, not just the ones that exist today.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex min-h-dvh">
      <Sidebar userName={user.name} userEmail={user.email} />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
