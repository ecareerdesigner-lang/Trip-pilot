/**
 * Display formatting for dates, times and durations.
 *
 * Trip dates are calendar dates (a trip that starts on the 4th starts on the
 * 4th in the destination, not in the viewer's timezone), so they are read and
 * written in UTC to keep them from sliding across a day boundary.
 */

const UTC = "UTC";

export function formatDayDate(
  date: Date | string,
  locale = "en-US",
  timeZone: string = UTC,
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(date));
}

export function formatDate(
  date: Date | string,
  locale = "en-US",
  timeZone: string = UTC,
): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(date));
}

/** "Mar 4 – 9, 2026" / "Dec 29, 2025 – Jan 2, 2026" */
export function formatDateRange(
  start: Date | string,
  end: Date | string,
  locale = "en-US",
  timeZone: string = UTC,
): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const sameMonth = sameYear && startDate.getUTCMonth() === endDate.getUTCMonth();

  const startText = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(startDate);

  // A day+year-only pattern is not a real date format — Intl renders it as
  // "2026 (day: 9)". Build the closing half explicitly instead.
  const endText = sameMonth
    ? `${new Intl.DateTimeFormat(locale, { day: "numeric", timeZone }).format(
        endDate,
      )}, ${new Intl.DateTimeFormat(locale, {
        year: "numeric",
        timeZone,
      }).format(endDate)}`
    : new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone,
      }).format(endDate);

  return `${startText} – ${endText}`;
}

export function formatTime(
  date: Date | string,
  locale = "en-US",
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(date));
}

/** 22 -> 72 (Celsius to Fahrenheit, rounded). */
export function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

/** (24, 15) -> "75° / 59°" */
export function formatTemperatureRange(
  highCelsius: number,
  lowCelsius: number,
): string {
  return `${celsiusToFahrenheit(highCelsius)}° / ${celsiusToFahrenheit(lowCelsius)}°`;
}

/** 95 -> "1h 35m", 45 -> "45 min", 120 -> "2h" */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe} min`;

  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function formatDistance(meters: number, unit: "mi" | "km" = "mi"): string {
  if (unit === "km") {
    const km = meters / 1000;
    return km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(1)} km`;
  }
  const miles = meters / 1609.344;
  return miles < 0.2
    ? `${Math.round(meters * 3.28084)} ft`
    : `${miles.toFixed(1)} mi`;
}

/** Whole nights between two calendar dates. */
export function nightsBetween(start: Date | string, end: Date | string): number {
  const startMs = Date.UTC(
    new Date(start).getUTCFullYear(),
    new Date(start).getUTCMonth(),
    new Date(start).getUTCDate(),
  );
  const endMs = Date.UTC(
    new Date(end).getUTCFullYear(),
    new Date(end).getUTCMonth(),
    new Date(end).getUTCDate(),
  );
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

/** Trip length in days, inclusive of both the arrival and departure days. */
export function daysBetweenInclusive(
  start: Date | string,
  end: Date | string,
): number {
  return nightsBetween(start, end) + 1;
}

export function relativeToToday(
  date: Date | string,
  locale = "en-US",
): string {
  const target = new Date(date);
  const todayMs = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  const targetMs = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  const days = Math.round((targetMs - todayMs) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(days) < 31) return formatter.format(days, "day");
  if (Math.abs(days) < 365) return formatter.format(Math.round(days / 30), "month");
  return formatter.format(Math.round(days / 365), "year");
}
