"use client";

import type { UseFormReturn } from "react-hook-form";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotBuiltYet } from "@/components/ui/not-built-yet";
import {
  BUDGET_CATEGORY_LABEL,
  FOOD_PREFERENCE_LABEL,
  PACE_LABEL,
  TRANSPORTATION_INTENT_LABEL,
  TRANSPORT_PREFERENCE_LABEL,
  TRAVEL_METHOD_LABEL,
} from "@/lib/constants";
import { formatDateRange, daysBetweenInclusive } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { allocateBudget } from "@/lib/travel/budget-allocation";
import {
  defaultTripName,
  parseMoneyText,
  type TripFormValues,
} from "@/lib/validation/trip";
import { BUDGET_CATEGORIES, type BudgetCategory } from "@/types/domain";

function Row({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="flex min-w-0 items-baseline gap-2 text-right text-sm text-ink">
        <span className="min-w-0">{value}</span>
        {onEdit ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={`Edit ${label}`}
            className="shrink-0"
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </dd>
    </div>
  );
}

export function StepReview({
  form,
  onJump,
}: {
  form: UseFormReturn<TripFormValues>;
  onJump: (step: number) => void;
}) {
  const values = form.watch();
  const totalCents = parseMoneyText(values.totalBudget);

  const explicit: Partial<Record<BudgetCategory, number | null>> = {
    TRANSPORTATION: parseMoneyText(values.transportationBudget),
    LODGING: parseMoneyText(values.lodgingBudget),
    FOOD: parseMoneyText(values.foodBudget),
    ACTIVITIES: parseMoneyText(values.activityBudget),
    LOCAL_TRANSPORTATION: parseMoneyText(values.localTransportationBudget),
  };
  const allocation = totalCents !== null ? allocateBudget(totalCents, explicit) : null;

  const days =
    values.startDate && values.endDate && values.endDate >= values.startDate
      ? daysBetweenInclusive(values.startDate, values.endDate)
      : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-card px-5 py-4">
        <h3 className="text-lg leading-tight">
          {values.name.trim() ||
            defaultTripName(values.destination, values.startDate)}
        </h3>
        <p className="tabular mt-1 text-sm text-muted">
          {values.origin} to {values.destination}
          {values.startDate && values.endDate
            ? ` · ${formatDateRange(values.startDate, values.endDate)}`
            : ""}
        </p>

        <dl className="mt-4">
          <Row
            label="Travelers"
            value={`${values.travelers} · ${days} days`}
            onEdit={() => onJump(0)}
          />
          <Row
            label="Getting there"
            value={`${TRAVEL_METHOD_LABEL[values.travelMethod]} · ${
              TRANSPORTATION_INTENT_LABEL[values.transportationIntent]
            }`}
            onEdit={() => onJump(1)}
          />
          <Row
            label="Budget"
            value={
              totalCents === null ? (
                <span className="text-muted">No budget set</span>
              ) : (
                <span className="tabular">{formatMoney(totalCents)}</span>
              )
            }
            onEdit={() => onJump(2)}
          />
          <Row
            label="Pace"
            value={`${PACE_LABEL[values.pace]} · ${
              FOOD_PREFERENCE_LABEL[values.foodPreference]
            }`}
            onEdit={() => onJump(3)}
          />
          <Row
            label="Getting around"
            value={
              values.transportPreferences.length === 0 ? (
                <span className="text-muted">No preference</span>
              ) : (
                values.transportPreferences
                  .map((preference) => TRANSPORT_PREFERENCE_LABEL[preference])
                  .join(", ")
              )
            }
            onEdit={() => onJump(3)}
          />
          <Row
            label="Must-dos"
            value={
              values.mustDos.length === 0 ? (
                <span className="text-muted">None</span>
              ) : (
                <ul className="space-y-0.5">
                  {values.mustDos.map((mustDo, index) => (
                    <li key={index}>{mustDo.title || "Untitled"}</li>
                  ))}
                </ul>
              )
            }
            onEdit={() => onJump(4)}
          />
          <Row
            label="Notes"
            value={
              values.notes.trim() ? (
                <span className="line-clamp-3 text-left">{values.notes}</span>
              ) : (
                <span className="text-muted">None</span>
              )
            }
            onEdit={() => onJump(5)}
          />
        </dl>
      </div>

      {allocation ? (
        <div className="rounded-card border border-line bg-card px-5 py-4">
          <h4 className="text-sm font-medium text-ink-soft">
            How the budget breaks down
          </h4>
          <p className="mt-0.5 text-xs text-muted">
            Amounts you set are kept. The rest are worked out from what is left.
          </p>
          <dl className="mt-3">
            {BUDGET_CATEGORIES.map((category) => (
              <div
                key={category}
                className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2 last:border-b-0"
              >
                <dt className="text-sm text-ink-soft">
                  {BUDGET_CATEGORY_LABEL[category]}
                  {allocation.fixed.includes(category) ? (
                    <span className="ml-2 text-xs text-muted">set by you</span>
                  ) : null}
                </dt>
                <dd className="tabular text-sm text-ink">
                  {formatMoney(allocation.amounts[category])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <NotBuiltYet
        feature="Generating the schedule"
        phase="Phases 13 and 14"
        detail="Saving works now — this trip will be stored as a draft with its days, budget ledger and must-dos. Querying travel providers and building the day-by-day itinerary comes next."
      />
    </div>
  );
}
