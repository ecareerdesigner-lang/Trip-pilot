import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { TripStatus } from "@/types/domain";
import { TRIP_STATUS_LABEL } from "@/lib/constants";

export type BadgeTone = "neutral" | "route" | "signal" | "alert" | "quiet";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-paper-deep text-ink-soft",
  route: "bg-route-soft text-route-deep",
  signal: "bg-signal-soft text-signal",
  alert: "bg-alert-soft text-alert",
  quiet: "bg-transparent text-muted border border-line",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5",
        "text-[0.6875rem] font-medium tracking-wide uppercase",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<TripStatus, BadgeTone> = {
  DRAFT: "quiet",
  PLANNING: "signal",
  READY: "route",
  COMPLETED: "neutral",
  ARCHIVED: "quiet",
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{TRIP_STATUS_LABEL[status]}</Badge>;
}
