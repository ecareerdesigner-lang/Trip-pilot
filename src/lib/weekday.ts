/**
 * Weekday handling for calendar dates.
 *
 * A model asked to move something "to Thursday" has to work out which date
 * that is, and gets it wrong often enough to matter — it once answered
 * "Thursday, August 28th" for a date that was a Friday, and moved the item
 * accordingly. So the weekday is supplied rather than inferred, and any
 * weekday named in a request is checked against the date that came back.
 *
 * All UTC: trip dates are calendar dates and must not shift by timezone.
 */

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Day of week for a `YYYY-MM-DD` date. Null when unparseable. */
export function weekdayOf(date: string): Weekday | null {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return null;
  return WEEKDAYS[new Date(parsed).getUTCDay()] ?? null;
}

/** "Friday, 28 August" — for prompts and previews, never for parsing. */
export function describeDate(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return date;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

/**
 * Weekdays a person named in a sentence.
 *
 * Deliberately literal: only whole words, and only real weekday names. The
 * point is to catch "move it to Thursday" and check the answer, not to parse
 * natural language.
 */
export function weekdaysMentioned(text: string): Weekday[] {
  const lower = text.toLowerCase();
  const found: Weekday[] = [];

  for (const weekday of WEEKDAYS) {
    // Word boundaries, so "sunday" does not match inside another word.
    if (new RegExp(`\\b${weekday}\\b`).test(lower)) found.push(weekday);
  }

  // "tues", "thurs" and "weds" are common enough to be worth catching.
  const abbreviations: [RegExp, Weekday][] = [
    [/\bmon\b/, "monday"],
    [/\btues?\b/, "tuesday"],
    [/\bweds?\b/, "wednesday"],
    [/\bthurs?\b/, "thursday"],
    [/\bfri\b/, "friday"],
    [/\bsat\b/, "saturday"],
    [/\bsun\b/, "sunday"],
  ];

  for (const [pattern, weekday] of abbreviations) {
    if (pattern.test(lower) && !found.includes(weekday)) found.push(weekday);
  }

  return found;
}

/**
 * Whether a date is consistent with the weekdays a request named.
 *
 * Returns true when the request named no weekday at all — there is nothing to
 * contradict. Returns true when the date matches any weekday mentioned, since
 * "Thursday or Friday" is a legitimate thing to ask.
 */
export function matchesRequestedWeekday(
  date: string,
  requestText: string,
): boolean {
  const requested = weekdaysMentioned(requestText);
  if (requested.length === 0) return true;

  const actual = weekdayOf(date);
  if (!actual) return false;

  return requested.includes(actual);
}
