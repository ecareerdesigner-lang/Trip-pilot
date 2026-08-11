"use client";

import type { UseFormReturn } from "react-hook-form";
import { Bus, Car, Plane, Ship, Train, MoreHorizontal } from "lucide-react";
import { FieldGroup } from "@/components/ui/field";
import { RadioCards, type OptionCard } from "@/components/ui/option-cards";
import {
  TRANSPORTATION_INTENT_LABEL,
  TRAVEL_METHOD_LABEL,
} from "@/lib/constants";
import type { TransportationIntent, TravelMethod } from "@/types/domain";
import type { TripFormValues } from "@/lib/validation/trip";

const METHOD_OPTIONS: OptionCard<TravelMethod>[] = [
  { value: "FLIGHT", label: TRAVEL_METHOD_LABEL.FLIGHT, icon: <Plane className="size-4" /> },
  { value: "DRIVING", label: TRAVEL_METHOD_LABEL.DRIVING, icon: <Car className="size-4" /> },
  { value: "TRAIN", label: TRAVEL_METHOD_LABEL.TRAIN, icon: <Train className="size-4" /> },
  { value: "BUS", label: TRAVEL_METHOD_LABEL.BUS, icon: <Bus className="size-4" /> },
  { value: "CRUISE", label: TRAVEL_METHOD_LABEL.CRUISE, icon: <Ship className="size-4" /> },
  { value: "OTHER", label: TRAVEL_METHOD_LABEL.OTHER, icon: <MoreHorizontal className="size-4" /> },
];

const INTENT_OPTIONS: OptionCard<TransportationIntent>[] = [
  {
    value: "SEARCH",
    label: TRANSPORTATION_INTENT_LABEL.SEARCH,
    description: "Look for real options and put the best ones on the schedule.",
  },
  {
    value: "ALREADY_BOOKED",
    label: TRANSPORTATION_INTENT_LABEL.ALREADY_BOOKED,
    description: "Plan the days around what you have. You can add the times later.",
  },
  {
    value: "RECOMMEND",
    label: TRANSPORTATION_INTENT_LABEL.RECOMMEND,
    description: "Suggest what fits the budget and the schedule without booking anything.",
  },
];

export function StepTransportation({
  form,
}: {
  form: UseFormReturn<TripFormValues>;
}) {
  const { watch, setValue, formState } = form;
  const travelMethod = watch("travelMethod");
  const transportationIntent = watch("transportationIntent");

  return (
    <div className="space-y-6">
      <FieldGroup
        label="How are you travelling there?"
        error={formState.errors.travelMethod?.message}
      >
        <RadioCards
          name="travelMethod"
          columns={3}
          options={METHOD_OPTIONS}
          value={travelMethod}
          onChange={(value) =>
            setValue("travelMethod", value, { shouldDirty: true })
          }
        />
      </FieldGroup>

      <FieldGroup
        label="What should TripPilot do about it?"
        error={formState.errors.transportationIntent?.message}
      >
        <RadioCards
          name="transportationIntent"
          columns={1}
          options={INTENT_OPTIONS}
          value={transportationIntent}
          onChange={(value) =>
            setValue("transportationIntent", value, { shouldDirty: true })
          }
        />
      </FieldGroup>
    </div>
  );
}
