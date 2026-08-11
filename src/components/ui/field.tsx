import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Label, hint and error for one input.
 *
 * The hint explains; the error says what went wrong and how to fix it. They
 * are separate elements so a field can carry both without the hint being
 * mistaken for an error, and both are wired to the input through
 * `aria-describedby` by the caller.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-ink-soft"
      >
        {label}
        {required ? (
          <span className="ml-1 text-muted" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Groups radio or checkbox cards, which cannot use a `<label for>`. */
export function FieldGroup({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="text-sm font-medium text-ink-soft">{label}</legend>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs text-alert" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
