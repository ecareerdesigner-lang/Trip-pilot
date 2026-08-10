"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { PRIMARY_NAV, NEW_TRIP_LINK, isActive } from "@/components/layout/nav-links";

const LINKS = [
  ...PRIMARY_NAV.slice(0, 2),
  { ...NEW_TRIP_LINK, label: "New trip" },
  ...PRIMARY_NAV.slice(2),
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main"
    >
      {LINKS.map((link) => {
        const active = isActive(pathname, link);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.6875rem]",
              active ? "text-route-deep" : "text-muted",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
