"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CURRENCIES, TIMEZONES } from "@/lib/validation/profile";
import type { ProfileResult } from "@/app/(app)/settings/actions";

/**
 * Account settings.
 *
 * Currency formats every price in the app and home city seeds the wizard's
 * starting location, so these are not cosmetic — being unable to change them
 * after signing up is a small trap that makes software feel hostile.
 */
export function ProfileForm({
  initial,
  action,
}: {
  initial: {
    name: string;
    homeCity: string;
    currency: string;
    timezone: string;
  };
  action: (input: unknown) => Promise<ProfileResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    setField(null);
    setSaved(false);

    start(async () => {
      const result = await action(Object.fromEntries(formData.entries()));
      if (result.ok) {
        setSaved(true);
        router.refresh();
        return;
      }
      setError(result.message);
      setField(result.field ?? null);
    });
  }

  const selectStyles =
    "h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none focus:border-route";

  return (
    <Card>
      <CardHeader
        title="Your details"
        description="Used to format prices and to fill in trips faster."
      />
      <CardBody>
        <form action={submit} className="space-y-4">
          <Field
            id="name"
            label="Name"
            required
            error={field === "name" ? (error ?? undefined) : undefined}
          >
            <Input
              id="name"
              name="name"
              defaultValue={initial.name}
              invalid={field === "name"}
              required
            />
          </Field>

          <Field
            id="homeCity"
            label="Home city"
            hint="Fills in the starting point when you plan a trip."
            error={field === "homeCity" ? (error ?? undefined) : undefined}
          >
            <Input
              id="homeCity"
              name="homeCity"
              defaultValue={initial.homeCity}
              placeholder="Charlotte, NC"
              invalid={field === "homeCity"}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="currency"
              label="Currency"
              hint="Used for new trips and for totals. Existing trips keep the currency their amounts were entered in."
              error={field === "currency" ? (error ?? undefined) : undefined}
            >
              <select
                id="currency"
                name="currency"
                defaultValue={initial.currency}
                className={selectStyles}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} — {currency.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id="timezone"
              label="Timezone"
              error={field === "timezone" ? (error ?? undefined) : undefined}
            >
              <select
                id="timezone"
                name="timezone"
                defaultValue={initial.timezone}
                className={selectStyles}
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && !field ? (
            <p
              className="rounded-card border border-alert bg-alert-soft px-3.5 py-2.5 text-sm text-alert"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Save changes
            </Button>

            {saved && !pending ? (
              <span
                className="flex items-center gap-1.5 text-sm text-route-deep"
                role="status"
              >
                <Check className="size-4" aria-hidden />
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
