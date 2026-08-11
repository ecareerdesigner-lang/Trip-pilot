"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { daysBetweenInclusive, nightsBetween } from "@/lib/format";
import type { TripFormValues } from "@/lib/validation/trip";

export function StepDestination({
  form,
}: {
  form: UseFormReturn<TripFormValues>;
}) {
  const { register, formState, watch } = form;
  const errors = formState.errors;

  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const validRange =
    Boolean(startDate) && Boolean(endDate) && endDate >= startDate;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="origin"
          label="Starting from"
          hint="City, or the airport you are leaving from."
          required
          error={errors.origin?.message}
        >
          <Input
            id="origin"
            autoComplete="off"
            placeholder="Charlotte, NC"
            invalid={Boolean(errors.origin)}
            aria-describedby="origin-hint"
            {...register("origin")}
          />
        </Field>

        <Field
          id="destination"
          label="Going to"
          hint="One destination per trip for now."
          required
          error={errors.destination?.message}
        >
          <Input
            id="destination"
            autoComplete="off"
            placeholder="New York City"
            invalid={Boolean(errors.destination)}
            aria-describedby="destination-hint"
            {...register("destination")}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          id="startDate"
          label="Leaving"
          required
          error={errors.startDate?.message}
        >
          <Input
            id="startDate"
            type="date"
            invalid={Boolean(errors.startDate)}
            {...register("startDate")}
          />
        </Field>

        <Field
          id="endDate"
          label="Returning"
          required
          error={errors.endDate?.message}
        >
          <Input
            id="endDate"
            type="date"
            min={startDate || undefined}
            invalid={Boolean(errors.endDate)}
            {...register("endDate")}
          />
        </Field>

        <Field
          id="travelers"
          label="Travelers"
          required
          error={errors.travelers?.message}
        >
          <Input
            id="travelers"
            type="number"
            min={1}
            max={20}
            className="tabular"
            invalid={Boolean(errors.travelers)}
            {...register("travelers", { valueAsNumber: true })}
          />
        </Field>
      </div>

      {validRange ? (
        <p className="tabular text-sm text-muted">
          {daysBetweenInclusive(startDate, endDate)} days,{" "}
          {nightsBetween(startDate, endDate)} nights.
        </p>
      ) : null}

      <Field
        id="name"
        label="Trip name"
        hint="Optional. Left blank, TripPilot names it after the destination and month."
        error={errors.name?.message}
      >
        <Input
          id="name"
          autoComplete="off"
          placeholder="Broadway weekend"
          invalid={Boolean(errors.name)}
          aria-describedby="name-hint"
          {...register("name")}
        />
      </Field>
    </div>
  );
}
