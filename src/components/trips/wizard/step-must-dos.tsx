"use client";

import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ListChecks } from "lucide-react";
import type { TripFormValues } from "@/lib/validation/trip";

const EXAMPLES = [
  "See a Broadway show",
  "Statue of Liberty",
  "Dinner at a specific restaurant",
  "A game at the ballpark",
];

export function StepMustDos({ form }: { form: UseFormReturn<TripFormValues> }) {
  const { control, register, formState } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "mustDos",
  });

  const errors = formState.errors.mustDos;

  return (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <div className="rounded-card border border-line bg-card">
          <EmptyState
            icon={<ListChecks className="size-5" aria-hidden />}
            title="Nothing locked in yet"
            description="Add the things the trip would feel incomplete without. Everything else is a suggestion that can move."
            action={
              <Button
                onClick={() => append({ title: "", description: "" })}
                size="md"
              >
                <Plus className="size-4" aria-hidden />
                Add a must-do
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {fields.map((field, index) => (
              <li
                key={field.id}
                className="rounded-card border border-line bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="tabular mt-2.5 w-5 shrink-0 text-xs text-muted">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      aria-label={`Must-do ${index + 1}`}
                      placeholder="See a Broadway show"
                      invalid={Boolean(errors?.[index]?.title)}
                      {...register(`mustDos.${index}.title` as const)}
                    />
                    {errors?.[index]?.title ? (
                      <p className="text-xs text-alert" role="alert">
                        {errors[index]?.title?.message}
                      </p>
                    ) : null}
                    <Textarea
                      rows={2}
                      aria-label={`Details for must-do ${index + 1}`}
                      placeholder="Anything that matters — a date, a time, a specific place."
                      invalid={Boolean(errors?.[index]?.description)}
                      {...register(`mustDos.${index}.description` as const)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove must-do ${index + 1}`}
                    onClick={() => remove(index)}
                    className="mt-1 shrink-0"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <Button
            variant="secondary"
            onClick={() => append({ title: "", description: "" })}
          >
            <Plus className="size-4" aria-hidden />
            Add another
          </Button>
        </>
      )}

      {typeof errors?.message === "string" ? (
        <p className="text-xs text-alert" role="alert">
          {errors.message}
        </p>
      ) : null}

      <p className="text-xs text-muted">
        For example: {EXAMPLES.join(" · ")}
      </p>
    </div>
  );
}
