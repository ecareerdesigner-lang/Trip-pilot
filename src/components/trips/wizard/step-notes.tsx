"use client";

import type { UseFormReturn } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import type { TripFormValues } from "@/lib/validation/trip";

const PROMPTS = [
  "Travelling with anyone who cannot walk far?",
  "Celebrating something?",
  "Anything you would rather avoid?",
  "Meeting people while you are there?",
];

export function StepNotes({ form }: { form: UseFormReturn<TripFormValues> }) {
  const { register, watch, formState } = form;
  const value = watch("notes");

  return (
    <div className="space-y-5">
      <Field
        id="notes"
        label="Notes"
        hint="Optional. Anything here is taken into account when the days are put together."
        error={formState.errors.notes?.message}
      >
        <Textarea
          id="notes"
          rows={6}
          placeholder="Anniversary trip. One of us cannot do a lot of stairs. We would rather eat where locals eat than anywhere with a line."
          invalid={Boolean(formState.errors.notes)}
          aria-describedby="notes-hint"
          {...register("notes")}
        />
      </Field>

      <p className="tabular text-xs text-muted">{value.length}/2000</p>

      <div className="rounded-card border border-line bg-paper-deep/50 px-4 py-3">
        <p className="text-xs font-medium text-ink-soft">Worth mentioning</p>
        <ul className="mt-1.5 space-y-1">
          {PROMPTS.map((prompt) => (
            <li key={prompt} className="text-xs text-muted">
              {prompt}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
