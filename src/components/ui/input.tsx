"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const BASE =
  "w-full rounded-lg border bg-card px-3 text-sm text-ink placeholder:text-muted/70 " +
  "transition-colors outline-none focus:border-route disabled:opacity-60";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        BASE,
        "h-10",
        invalid ? "border-alert" : "border-line",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        BASE,
        "resize-y py-2 leading-relaxed",
        invalid ? "border-alert" : "border-line",
        className,
      )}
      {...props}
    />
  );
});

/**
 * Money input. Dollars are what people type; cents are what the app stores.
 * The conversion happens once, in `toTripPayload`, not here.
 */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; currency?: string }
>(function MoneyInput({ className, invalid, currency = "$", ...props }, ref) {
  return (
    <div className="relative">
      <span
        className="tabular pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted"
        aria-hidden
      >
        {currency}
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={cn(
          BASE,
          "tabular h-10 pl-7",
          invalid ? "border-alert" : "border-line",
          className,
        )}
        {...props}
      />
    </div>
  );
});
