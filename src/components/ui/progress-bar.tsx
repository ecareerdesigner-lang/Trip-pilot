import { cn } from "@/lib/cn";

/**
 * Budget and generation progress. `tone` is derived by the caller from real
 * numbers — the bar never decides on its own that spending is a problem.
 */
export function ProgressBar({
  value,
  max = 100,
  tone = "route",
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: "route" | "signal" | "alert";
  label?: string;
  className?: string;
}) {
  const safeMax = max <= 0 ? 1 : max;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));

  const fill =
    tone === "alert"
      ? "bg-alert"
      : tone === "signal"
        ? "bg-signal"
        : "bg-route";

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-pill bg-paper-deep", className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
    >
      <div
        className={cn("h-full rounded-pill transition-[width] duration-500", fill)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
