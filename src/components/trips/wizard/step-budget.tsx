"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/input";
import { BUDGET_CATEGORY_LABEL } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { daysBetweenInclusive } from "@/lib/format";
import {
  allocateBudget,
  dailyPerTravelerCents,
  summarizeBudget,
} from "@/lib/travel/budget-allocation";
import { parseMoneyText, type TripFormValues } from "@/lib/validation/trip";
import { BUDGET_CATEGORIES, type BudgetCategory } from "@/types/domain";

/** Category to the form field that carries it. MISCELLANEOUS has no field. */
const FIELD_BY_CATEGORY: Partial<Record<BudgetCategory, keyof TripFormValues>> = {
  TRANSPORTATION: "transportationBudget",
  LODGING: "lodgingBudget",
  FOOD: "foodBudget",
  ACTIVITIES: "activityBudget",
  LOCAL_TRANSPORTATION: "localTransportationBudget",
};

export function StepBudget({ form }: { form: UseFormReturn<TripFormValues> }) {
  const { register, watch, formState } = form;
  const errors = formState.errors;

  const totalCents = parseMoneyText(watch("totalBudget"));
  const explicit: Partial<Record<BudgetCategory, number | null>> = {
    TRANSPORTATION: parseMoneyText(watch("transportationBudget")),
    LODGING: parseMoneyText(watch("lodgingBudget")),
    FOOD: parseMoneyText(watch("foodBudget")),
    ACTIVITIES: parseMoneyText(watch("activityBudget")),
    LOCAL_TRANSPORTATION: parseMoneyText(watch("localTransportationBudget")),
  };

  const summary = summarizeBudget(totalCents, explicit);
  const allocation = totalCents !== null ? allocateBudget(totalCents, explicit) : null;

  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const days =
    startDate && endDate && endDate >= startDate
      ? daysBetweenInclusive(startDate, endDate)
      : 0;
  const perDay =
    totalCents !== null && days > 0
      ? dailyPerTravelerCents(totalCents, days, watch("travelers") || 1)
      : null;

  return (
    <div className="space-y-6">
      <Field
        id="totalBudget"
        label="Total budget"
        hint="Everything: getting there, sleeping, eating, doing. Leave blank to plan without one."
        error={errors.totalBudget?.message}
      >
        <MoneyInput
          id="totalBudget"
          placeholder="3000"
          invalid={Boolean(errors.totalBudget)}
          aria-describedby="totalBudget-hint"
          className="sm:max-w-48"
          {...register("totalBudget")}
        />
      </Field>

      {perDay !== null ? (
        <p className="tabular text-sm text-muted">
          About {formatMoney(perDay)} per traveler per day across {days} days.
        </p>
      ) : null}

      <div>
        <h3 className="text-sm font-medium text-ink-soft">By category</h3>
        <p className="mt-0.5 text-xs text-muted">
          Optional. Fill in only the ones you already know — the rest are worked
          out from what is left.
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {BUDGET_CATEGORIES.filter(
            (category) => FIELD_BY_CATEGORY[category] !== undefined,
          ).map((category) => {
            const field = FIELD_BY_CATEGORY[category]!;
            const suggested = allocation?.amounts[category] ?? null;
            const isDerived = allocation?.derived.includes(category) ?? false;

            return (
              <Field
                key={category}
                id={field}
                label={BUDGET_CATEGORY_LABEL[category]}
                hint={
                  isDerived && suggested !== null && suggested > 0 ? (
                    <span className="tabular">
                      Suggested {formatMoney(suggested)}
                    </span>
                  ) : undefined
                }
                error={errors[field]?.message}
              >
                <MoneyInput
                  id={field}
                  placeholder={
                    suggested !== null && suggested > 0
                      ? String(Math.round(suggested / 100))
                      : "0"
                  }
                  invalid={Boolean(errors[field])}
                  {...register(field)}
                />
              </Field>
            );
          })}
        </div>
      </div>

      {totalCents !== null ? (
        <div
          className={cnSummary(summary.overAllocated)}
          role={summary.overAllocated ? "alert" : undefined}
        >
          {summary.overAllocated ? (
            <p className="tabular text-sm text-alert">
              Categories add up to {formatMoney(summary.allocatedCents)}, which
              is {formatMoney(-summary.unallocatedCents)} more than the total.
            </p>
          ) : (
            <p className="tabular text-sm text-ink-soft">
              {formatMoney(summary.allocatedCents)} assigned,{" "}
              {formatMoney(summary.unallocatedCents)} left for TripPilot to
              spread across the rest.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function cnSummary(over: boolean): string {
  return over
    ? "rounded-card border border-alert bg-alert-soft px-4 py-3"
    : "rounded-card border border-line bg-paper-deep/50 px-4 py-3";
}
