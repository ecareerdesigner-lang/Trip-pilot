"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { WIZARD_STEPS } from "@/components/trips/wizard/steps";

/**
 * Progress along the wizard, drawn as a route: stops on a line, the way the
 * itinerary itself is drawn. Completed stops are filled, the current one is
 * ringed, and the ones ahead are hollow.
 */
export function Stepper({
  current,
  furthest,
  onJump,
}: {
  current: number;
  /** Highest step reached, so completed steps can be revisited. */
  furthest: number;
  onJump: (index: number) => void;
}) {
  return (
    <nav aria-label="Trip setup progress" className="mb-8">
      <ol className="flex items-center">
        {WIZARD_STEPS.map((step, index) => {
          const done = index < furthest;
          const active = index === current;
          const reachable = index <= furthest;
          const isLast = index === WIZARD_STEPS.length - 1;

          return (
            <li key={step.shortLabel} className={cn("flex items-center", !isLast && "flex-1")}>
              <button
                type="button"
                onClick={() => reachable && onJump(index)}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex shrink-0 flex-col items-center gap-1.5",
                  reachable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-pill border-2 text-xs font-medium transition-colors",
                    done && "border-route bg-route text-white",
                    active && "border-route bg-card text-route-deep",
                    !done && !active && "border-line bg-card text-muted",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-[0.6875rem] whitespace-nowrap sm:block",
                    active ? "font-medium text-ink" : "text-muted",
                  )}
                >
                  {step.shortLabel}
                </span>
              </button>

              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1.5 h-0.5 flex-1 rounded-pill transition-colors sm:mx-2",
                    done ? "bg-route" : "bg-line",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
