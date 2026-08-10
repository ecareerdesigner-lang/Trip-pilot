import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A single figure with its label. The number is set in mono because these
 * appear in a row and are meant to be scanned, not read.
 */
export function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {icon ? (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-pill bg-paper-deep text-ink-soft">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-medium tracking-[0.08em] text-muted uppercase">
          {label}
        </p>
        <p className="tabular mt-1 text-xl leading-none font-medium text-ink">
          {value}
        </p>
        {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}
