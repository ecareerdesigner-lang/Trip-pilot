/**
 * Money helpers.
 *
 * All amounts in TripPilot are integer cents. Floats are never used for
 * currency: `0.1 + 0.2 !== 0.3` shows up in a budget total as a stray penny
 * and in a variance calculation as a wrong sign.
 */

export type Cents = number;

export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

export function sumCents(values: readonly (Cents | null | undefined)[]): Cents {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** Split `total` into `parts` without losing or inventing cents. */
export function divideCents(total: Cents, parts: number): Cents[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

/** Apply integer percentage weights to a total, preserving the exact sum. */
export function allocateCents(
  total: Cents,
  weights: readonly number[],
): Cents[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) return weights.map(() => 0);

  const raw = weights.map((weight) => (total * weight) / weightTotal);
  const floored = raw.map((value) => Math.floor(value));
  let remainder = total - floored.reduce((sum, value) => sum + value, 0);

  // Hand the leftover cents to the largest fractional parts first.
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floored];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remainder -= 1;
  }
  return result;
}

export function formatMoney(
  cents: Cents | null | undefined,
  currency = "USD",
  locale = "en-US",
): string {
  const value = fromCents(cents ?? 0);
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Compact form for dashboard tiles: $1.2k, $14k, $1.4M. */
export function formatMoneyCompact(
  cents: Cents | null | undefined,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(fromCents(cents ?? 0));
}
