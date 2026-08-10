import Link from "next/link";
import { Users, Wallet, ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TripStatusBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatDateRange, nightsBetween, relativeToToday } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { TripSummary } from "@/types/view";

function budgetTone(planned: number, budget: number | null) {
  if (!budget) return "route" as const;
  const ratio = planned / budget;
  if (ratio > 1) return "alert" as const;
  if (ratio > 0.9) return "signal" as const;
  return "route" as const;
}

export function TripCard({ trip }: { trip: TripSummary }) {
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const tone = budgetTone(trip.plannedCents, trip.totalBudgetCents);
  const overBudget =
    trip.totalBudgetCents !== null && trip.plannedCents > trip.totalBudgetCents;

  return (
    <Card className="transition-shadow duration-200 hover:shadow-lift">
      <Link href={`/trips/${trip.id}`} className="block px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-medium tracking-[0.1em] text-muted uppercase">
              {trip.destination}
            </p>
            <h3 className="mt-1 truncate text-base leading-tight">{trip.name}</h3>
          </div>
          <TripStatusBadge status={trip.status} />
        </div>

        <p className="tabular mt-3 text-sm text-ink-soft">
          {formatDateRange(trip.startDate, trip.endDate)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {nights} {nights === 1 ? "night" : "nights"} ·{" "}
          {relativeToToday(trip.startDate)}
        </p>

        {trip.totalBudgetCents !== null ? (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="tabular text-sm text-ink">
                {formatMoney(trip.plannedCents, trip.currency)}
              </span>
              <span className="tabular text-xs text-muted">
                of {formatMoney(trip.totalBudgetCents, trip.currency)}
              </span>
            </div>
            <ProgressBar
              className="mt-2"
              value={trip.plannedCents}
              max={trip.totalBudgetCents}
              tone={tone}
              label={`Planned spending for ${trip.name}`}
            />
            {overBudget ? (
              <p className="mt-1.5 text-xs text-alert">
                Planned spending is over budget by{" "}
                {formatMoney(
                  trip.plannedCents - trip.totalBudgetCents,
                  trip.currency,
                )}
                .
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line-soft pt-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden />
            {trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}
          </span>
          <span className="flex items-center gap-1.5">
            <ListChecks className="size-3.5" aria-hidden />
            {trip.mustDoScheduledCount}/{trip.mustDoCount} must-dos scheduled
          </span>
          {trip.itemCount > 0 ? (
            <span className="flex items-center gap-1.5">
              <Wallet className="size-3.5" aria-hidden />
              {trip.itemCount} items
            </span>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
