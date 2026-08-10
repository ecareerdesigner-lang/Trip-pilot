import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Map, Settings, Plane } from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Also highlight this link for nested routes beneath it. */
  matchPrefix?: boolean;
}

export const PRIMARY_NAV: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trips", label: "Trips", icon: Map, matchPrefix: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const NEW_TRIP_LINK: NavLink = {
  href: "/trips/new",
  label: "Plan a new trip",
  icon: Plane,
};

export function isActive(
  pathname: string,
  link: Pick<NavLink, "href" | "matchPrefix">,
): boolean {
  if (pathname === link.href) return true;
  if (!link.matchPrefix) return false;
  // `/trips/new` should light up "Trips" but `/trips` should not match
  // an unrelated route such as `/tripsomething`.
  return pathname.startsWith(`${link.href}/`);
}
