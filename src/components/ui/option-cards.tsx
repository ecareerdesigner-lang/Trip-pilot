"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface OptionCard<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

const CARD =
  "relative flex cursor-pointer items-start gap-3 rounded-card border bg-card p-3 text-left " +
  "transition-colors hover:border-route/60 focus-within:border-route";

/** Pick exactly one. */
export function RadioCards<T extends string>({
  name,
  options,
  value,
  onChange,
  columns = 2,
}: {
  name: string;
  options: OptionCard<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 1 && "grid-cols-1",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(CARD, selected ? "border-route bg-route-soft/40" : "border-line")}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-pill border",
                selected ? "border-route bg-route text-white" : "border-line",
              )}
              aria-hidden
            >
              {selected ? <span className="size-1.5 rounded-pill bg-white" /> : null}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {option.icon}
                {option.label}
              </span>
              {option.description ? (
                <span className="mt-0.5 block text-xs text-muted">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Pick any number, including none. */
export function CheckboxCards<T extends string>({
  options,
  values,
  onChange,
  columns = 2,
}: {
  options: OptionCard<T>[];
  values: T[];
  onChange: (values: T[]) => void;
  columns?: 1 | 2 | 3;
}) {
  function toggle(value: T) {
    onChange(
      values.includes(value)
        ? values.filter((entry) => entry !== value)
        : [...values, value],
    );
  }

  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 1 && "grid-cols-1",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <label
            key={option.value}
            className={cn(CARD, selected ? "border-route bg-route-soft/40" : "border-line")}
          >
            <input
              type="checkbox"
              value={option.value}
              checked={selected}
              onChange={() => toggle(option.value)}
              className="sr-only"
            />
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                selected ? "border-route bg-route text-white" : "border-line",
              )}
              aria-hidden
            >
              {selected ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {option.icon}
                {option.label}
              </span>
              {option.description ? (
                <span className="mt-0.5 block text-xs text-muted">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
