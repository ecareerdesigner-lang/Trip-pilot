"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AuthResult } from "@/app/(auth)/actions";

/**
 * Sign in and sign up.
 *
 * One component for both, because the two forms differ only in which fields
 * they show — and keeping them together means the error handling, the pending
 * state and the redirect cannot drift apart between them.
 */
export function AuthForm({
  mode,
  action,
}: {
  mode: "sign-in" | "sign-up";
  action: (input: unknown) => Promise<AuthResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  const isSignUp = mode === "sign-up";

  function submit(formData: FormData) {
    setError(null);
    setField(null);

    start(async () => {
      const input = Object.fromEntries(formData.entries());
      const result = await action(input);

      if (result.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setError(result.message);
      setField(result.field ?? null);
    });
  }

  return (
    <Card>
      <CardBody>
        <h1 className="text-xl leading-tight">
          {isSignUp ? "Create an account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isSignUp
            ? "Your trips, itineraries and budgets, kept in one place."
            : "Sign in to pick up where you left off."}
        </p>

        <form action={submit} className="mt-6 space-y-4">
          {isSignUp ? (
            <Field
              id="name"
              label="Name"
              required
              error={field === "name" ? (error ?? undefined) : undefined}
            >
              <Input
                id="name"
                name="name"
                autoComplete="name"
                placeholder="Phil"
                invalid={field === "name"}
                required
              />
            </Field>
          ) : null}

          <Field
            id="email"
            label="Email"
            required
            error={field === "email" ? (error ?? undefined) : undefined}
          >
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              invalid={field === "email"}
              required
            />
          </Field>

          <Field
            id="password"
            label="Password"
            hint={
              isSignUp
                ? "At least 12 characters. A phrase you can remember works well."
                : undefined
            }
            required
            error={field === "password" ? (error ?? undefined) : undefined}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              invalid={field === "password"}
              required
            />
          </Field>

          {isSignUp ? (
            <Field
              id="confirmPassword"
              label="Confirm password"
              required
              error={
                field === "confirmPassword" ? (error ?? undefined) : undefined
              }
            >
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                invalid={field === "confirmPassword"}
                required
              />
            </Field>
          ) : null}

          {error && !field ? (
            <p
              className="rounded-card border border-alert bg-alert-soft px-3.5 py-2.5 text-sm text-alert"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {isSignUp ? "Already have an account? " : "New here? "}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="text-route-deep hover:underline"
          >
            {isSignUp ? "Sign in" : "Create one"}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
