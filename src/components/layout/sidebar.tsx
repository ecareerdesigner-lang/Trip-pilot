"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonStyles } from "@/components/ui/button";
import { PRIMARY_NAV, NEW_TRIP_LINK, isActive } from "@/components/layout/nav-links";
import { signOutAction } from "@/app/(auth)/actions";

export function Sidebar({
  userName,
  userEmail,
}: {
  userName?: string;
  userEmail?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-card md:flex">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-5 py-5 text-ink"
      >
        <span className="flex size-8 items-center justify-center rounded-pill bg-route text-white">
          <Compass className="size-4.5" aria-hidden />
        </span>
        <span className="font-display text-[1.0625rem] leading-none font-semibold tracking-tight">
          TripPilot
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
        {PRIMARY_NAV.map((link) => {
          const active = isActive(pathname, link);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-route-soft font-medium text-route-deep"
                  : "text-muted hover:bg-paper-deep hover:text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-3">
        <Link
          href={NEW_TRIP_LINK.href}
          className={buttonStyles("primary", "md", "w-full")}
        >
          <NEW_TRIP_LINK.icon className="size-4" aria-hidden />
          Plan a new trip
        </Link>

        {userEmail ? (
          <div className="mt-3 border-t border-line-soft pt-3">
            <p className="truncate px-1 text-xs font-medium text-ink-soft">
              {userName}
            </p>
            <p className="truncate px-1 text-xs text-muted">{userEmail}</p>
            <form action={signOutAction}>
              <button
                type="submit"
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-xs text-muted transition-colors hover:text-ink"
              >
                <LogOut className="size-3.5" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
