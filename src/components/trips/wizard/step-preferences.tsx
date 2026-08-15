"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  CheckboxCards,
  RadioCards,
  type OptionCard,
} from "@/components/ui/option-cards";
import {
  FOOD_PREFERENCE_LABEL,
  PACE_ACTIVITY_TARGET,
  PACE_DESCRIPTION,
  PACE_LABEL,
  TRANSPORT_PREFERENCE_LABEL,
} from "@/lib/constants";
import {
  FOOD_PREFERENCES,
  PACES,
  TRANSPORT_PREFERENCES,
  type FoodPreference,
  type Pace,
  type TransportPreference,
} from "@/types/domain";
import type { TripFormValues } from "@/lib/validation/trip";

const PACE_OPTIONS: OptionCard<Pace>[] = PACES.map((pace) => ({
  value: pace,
  label: PACE_LABEL[pace],
  description: PACE_DESCRIPTION[pace],
}));

const FOOD_OPTIONS: OptionCard<FoodPreference>[] = FOOD_PREFERENCES.map(
  (preference) => ({
    value: preference,
    label: FOOD_PREFERENCE_LABEL[preference],
  }),
);

const TRANSPORT_OPTIONS: OptionCard<TransportPreference>[] =
  TRANSPORT_PREFERENCES.map((preference) => ({
    value: preference,
    label: TRANSPORT_PREFERENCE_LABEL[preference],
  }));

export function StepPreferences({
  form,
}: {
  form: UseFormReturn<TripFormValues>;
}) {
  const { watch, setValue, formState, register } = form;
  const pace = watch("pace");
  const transportPreferences = watch("transportPreferences");

  return (
    <div className="space-y-6">
      <FieldGroup
        label="Pace"
        hint={`Roughly ${PACE_ACTIVITY_TARGET[pace]} things a day.`}
        error={formState.errors.pace?.message}
      >
        <RadioCards
          name="pace"
          columns={3}
          options={PACE_OPTIONS}
          value={pace}
          onChange={(value) => setValue("pace", value, { shouldDirty: true })}
        />
      </FieldGroup>

      <FieldGroup
        label="Food"
        error={formState.errors.foodPreference?.message}
      >
        <RadioCards
          name="foodPreference"
          columns={3}
          options={FOOD_OPTIONS}
          value={watch("foodPreference")}
          onChange={(value) =>
            setValue("foodPreference", value, { shouldDirty: true })
          }
        />
      </FieldGroup>

      <FieldGroup
        label="Getting around"
        hint="Pick as many as apply. Leave it empty and TripPilot decides per leg."
        error={formState.errors.transportPreferences?.message}
      >
        <CheckboxCards
          columns={3}
          options={TRANSPORT_OPTIONS}
          values={transportPreferences}
          onChange={(values) =>
            setValue("transportPreferences", values, { shouldDirty: true })
          }
        />
      </FieldGroup>

      <FieldGroup
        label="Day hours"
        hint="How early to start, and how late to run. Check-out and the nightly return to the hotel are allowed a few minutes past this."
      >
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="dayStartTime"
            label="Start"
            error={formState.errors.dayStartTime?.message}
          >
            <Input
              id="dayStartTime"
              type="time"
              invalid={Boolean(formState.errors.dayStartTime)}
              {...register("dayStartTime")}
            />
          </Field>
          <Field
            id="dayEndTime"
            label="End"
            error={formState.errors.dayEndTime?.message}
          >
            <Input
              id="dayEndTime"
              type="time"
              invalid={Boolean(formState.errors.dayEndTime)}
              {...register("dayEndTime")}
            />
          </Field>
        </div>
      </FieldGroup>
    </div>
  );
}
