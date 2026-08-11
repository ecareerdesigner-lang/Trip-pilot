"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldPath } from "react-hook-form";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/trips/wizard/stepper";
import { STEP_COUNT, WIZARD_STEPS } from "@/components/trips/wizard/steps";
import { StepDestination } from "@/components/trips/wizard/step-destination";
import { StepTransportation } from "@/components/trips/wizard/step-transportation";
import { StepBudget } from "@/components/trips/wizard/step-budget";
import { StepPreferences } from "@/components/trips/wizard/step-preferences";
import { StepMustDos } from "@/components/trips/wizard/step-must-dos";
import { StepNotes } from "@/components/trips/wizard/step-notes";
import { StepReview } from "@/components/trips/wizard/step-review";
import { createTripAction } from "@/app/(app)/trips/new/actions";
import {
  EMPTY_TRIP_FORM,
  STEP_FIELDS,
  tripFormSchema,
  type TripFormValues,
} from "@/lib/validation/trip";

/**
 * The seven-step trip wizard.
 *
 * React Hook Form holds the values; Zod does the validating. There is no
 * `zodResolver` here on purpose — the schema carries cross-field rules (a
 * return date before departure, categories exceeding the total) that only
 * make sense against the whole form, while each step must be checkable on
 * its own. So the full schema runs on every "Next" and only the issues
 * belonging to the current step are surfaced.
 *
 * The consequence is that a cross-field error appears on the step that owns
 * the field it is attached to, which is where the traveler can act on it.
 */
export function TripWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const form = useForm<TripFormValues>({
    defaultValues: EMPTY_TRIP_FORM,
    mode: "onSubmit",
  });

  const currentStep = WIZARD_STEPS[step]!;
  const isLastStep = step === STEP_COUNT - 1;

  /**
   * Validate the whole form, then report only what belongs to `stepIndex`.
   * Returns true when that step is clear to leave.
   */
  const validateStep = useCallback(
    (stepIndex: number): boolean => {
      const fields = STEP_FIELDS[stepIndex] ?? [];
      form.clearErrors();

      const result = tripFormSchema.safeParse(form.getValues());
      if (result.success) return true;

      const owned = result.error.issues.filter((issue) => {
        const root = issue.path[0];
        return typeof root === "string" && (fields as readonly string[]).includes(root);
      });

      for (const issue of owned) {
        form.setError(issue.path.join(".") as FieldPath<TripFormValues>, {
          type: "validation",
          message: issue.message,
        });
      }

      if (owned.length > 0) {
        // Send focus to the problem rather than making the traveler hunt.
        const first = owned[0]!;
        form.setFocus(first.path.join(".") as FieldPath<TripFormValues>, {
          shouldSelect: false,
        });
        return false;
      }

      return true;
    },
    [form],
  );

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(STEP_COUNT - 1, target));
      setStep(clamped);
      setFurthest((previous) => Math.max(previous, clamped));
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [],
  );

  const next = useCallback(() => {
    if (!validateStep(step)) return;
    goTo(step + 1);
  }, [goTo, step, validateStep]);

  const back = useCallback(() => {
    form.clearErrors();
    goTo(step - 1);
  }, [form, goTo, step]);

  /** Jumping backwards is always allowed; jumping forward validates on the way. */
  const jump = useCallback(
    (target: number) => {
      if (target <= step) {
        form.clearErrors();
        goTo(target);
        return;
      }
      for (let index = step; index < target; index += 1) {
        if (!validateStep(index)) {
          goTo(index);
          return;
        }
      }
      goTo(target);
    },
    [form, goTo, step, validateStep],
  );

  /**
   * Validate every step before saving, not just the one on screen. A traveler
   * who jumped back and cleared a required field must not get a failed write
   * as their first sign of it.
   */
  const submit = useCallback(() => {
    setSaveError(null);

    for (let index = 0; index < STEP_COUNT - 1; index += 1) {
      if (!validateStep(index)) {
        goTo(index);
        return;
      }
    }

    startSaving(async () => {
      const result = await createTripAction(form.getValues());
      if (result.ok) {
        router.push(`/trips/${result.tripId}`);
      } else {
        setSaveError(`${result.message} (reference ${result.traceId})`);
      }
    });
  }, [form, goTo, router, validateStep]);

  return (
    <div>
      <Stepper current={step} furthest={furthest} onJump={jump} />

      <div className="mb-6">
        <h2 className="text-xl leading-tight sm:text-2xl">{currentStep.title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          {currentStep.description}
        </p>
      </div>

      {/*
        No <form> element: submission is driven by the stepper rather than by
        Enter, and a nested form would let a stray keypress skip validation.
      */}
      <div>
        {step === 0 ? <StepDestination form={form} /> : null}
        {step === 1 ? <StepTransportation form={form} /> : null}
        {step === 2 ? <StepBudget form={form} /> : null}
        {step === 3 ? <StepPreferences form={form} /> : null}
        {step === 4 ? <StepMustDos form={form} /> : null}
        {step === 5 ? <StepNotes form={form} /> : null}
        {step === 6 ? <StepReview form={form} onJump={jump} /> : null}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-5">
        <Button
          variant="secondary"
          onClick={back}
          disabled={step === 0}
          className={step === 0 ? "invisible" : undefined}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>

        <p className="tabular text-xs text-muted">
          Step {step + 1} of {STEP_COUNT}
          {currentStep.optional ? " · optional" : ""}
        </p>

        {isLastStep ? (
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {saving ? "Saving" : "Save this trip"}
          </Button>
        ) : (
          <Button onClick={next}>
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {saveError ? (
        <p
          className="mt-4 rounded-card border border-alert bg-alert-soft px-4 py-3 text-sm text-alert"
          role="alert"
        >
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
