import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Trip section tabs.
 *
 * Sections without a page yet are rendered as disabled rather than hidden, so
 * the shape of the trip view is visible — but they are not links, because a
 * tab that navigates nowhere is worse than one that says it is not ready.
 */
const TABS = [
  { label: "Overview", path: "" },
  { label: "Itinerary", path: "/itinerary" },
  { label: "Map", path: null },
  { label: "Budget", path: "/budget" },
  { label: "Transportation", path: "/transportation" },
  { label: "Reservations", path: null },
  { label: "Documents", path: null },
] as const;

export function TripTabs({
  tripId,
  active,
}: {
  tripId: string;
  active: string;
}) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-line"
      aria-label="Trip sections"
    >
      {TABS.map((tab) => {
        const isActive = tab.label === active;
        const className = cn(
          "px-3 py-2 text-sm whitespace-nowrap transition-colors",
          isActive
            ? "border-b-2 border-route font-medium text-route-deep"
            : tab.path === null
              ? "text-muted/60"
              : "text-muted hover:text-ink",
        );

        if (tab.path === null) {
          return (
            <span
              key={tab.label}
              className={className}
              aria-disabled="true"
              title="Not built yet"
            >
              {tab.label}
            </span>
          );
        }

        return (
          <Link
            key={tab.label}
            href={`/trips/${tripId}${tab.path}`}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
