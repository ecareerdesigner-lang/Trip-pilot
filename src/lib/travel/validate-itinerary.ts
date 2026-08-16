import { PACE_BUFFER_MINUTES } from "@/lib/constants";
import { distanceMeters } from "@/lib/geo";
import { formatDuration, formatTime } from "@/lib/format";
import type { Pace, ValidationSeverity } from "@/types/domain";
import type { ItineraryDay, TimelineItem } from "@/types/view";

/**
 * Reality-check engine.
 *
 * A schedule can be perfectly well-formed and still impossible. This is what
 * catches the museum that ends at 5:30 when the show starts at 6:00 and the
 * subway takes 35 minutes — the specific failure a list of recommendations
 * will never notice, and the one that ruins an evening.
 *
 * Pure: plain objects in, warnings out. Every check is unit tested against
 * the exact situation it exists to catch.
 *
 * Severity means something here:
 *   ERROR   — cannot happen as scheduled. The traveler will miss something.
 *   WARNING — possible but uncomfortable, or likely to go wrong.
 *   INFO    — worth knowing, not a problem.
 */

export type ValidationCode =
  | "OVERLAP"
  | "INSUFFICIENT_TRAVEL_TIME"
  | "TIGHT_CONNECTION"
  | "MISSING_TRANSPORTATION"
  | "IMPLAUSIBLE_TRAVEL_SPEED"
  | "AFTER_CLOSING"
  | "BEFORE_OPENING"
  | "SHORT_MEAL"
  | "NO_MEAL"
  | "AIRPORT_ARRIVAL_BUFFER"
  | "EARLY_CHECK_IN"
  | "LATE_CHECK_OUT"
  | "OUTSIDE_TRAVEL_HOURS"
  | "LONG_DAY"
  | "EMPTY_DAY"
  | "BUDGET_OVERRUN"
  | "UNSCHEDULED_MUST_DO"
  | "DESCRIPTION_TIME_MISMATCH"
  | "ONLY_MEALS";

export interface ValidationWarning {
  severity: ValidationSeverity;
  code: ValidationCode;
  message: string;
  /** What the traveler can do about it. Omitted when there is nothing useful. */
  suggestion?: string;
  itemIds: string[];
  dayNumber: number | null;
}

export interface ValidationReport {
  warnings: ValidationWarning[];
  counts: Record<ValidationSeverity, number>;
  /** True when nothing on the schedule is impossible. Warnings may remain. */
  possible: boolean;
}

export interface OpeningHours {
  /** Minutes from midnight, local. */
  opensMinute: number;
  closesMinute: number;
}

export interface ValidateOptions {
  pace?: Pace;
  /** Hours the traveler wants scheduled within, minutes from midnight. */
  dayStartMinute?: number;
  dayEndMinute?: number;
  /** Opening hours by item id, where they are known. */
  hoursByItemId?: Map<string, OpeningHours>;
  /**
   * Must-dos the traveler required that never made it onto the schedule.
   * These are requirements, not suggestions, so an unplaced one is a real
   * finding rather than a note — the trip is not the trip they asked for.
   */
  unscheduledMustDos?: string[];
  /** Folded in so one report covers everything wrong with the trip. */
  budgetWarnings?: { severity: ValidationSeverity; message: string }[];
}

/**
 * Fastest each mode could plausibly go, in metres per minute. A leg faster
 * than this means the distance or the duration is wrong.
 */
const MAX_SPEED: Record<string, number> = {
  WALK: 133, // 8 km/h — a run
  BIKE: 500,
  SUBWAY: 1_500,
  BUS: 1_000,
  TRAIN: 5_000,
  TAXI: 1_800,
  UBER: 1_800,
  LYFT: 1_800,
  CAR: 2_000,
  FERRY: 1_200,
  FLIGHT: 20_000,
  OTHER: 20_000,
};

/** Two places closer than this need no journey scheduled between them. */
const SAME_PLACE_METERS = 250;
/** A meal shorter than this is not a meal. */
const MIN_MEAL_MINUTES = 30;
/** Domestic check-in, security and walking to the gate. */
const AIRPORT_BUFFER_MINUTES = 90;
/** Beyond this a day is exhausting even when it is possible. */
const LONG_DAY_MINUTES = 14 * 60;

const clock = (iso: string): string => formatTime(iso, "en-US", "UTC");
const minuteOfDay = (iso: string): number => {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

function travelMinutesInto(item: TimelineItem): number {
  return item.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
}

function hasPoint(item: TimelineItem): boolean {
  return item.latitude !== null && item.longitude !== null;
}

export function validateItinerary(
  days: ItineraryDay[],
  options: ValidateOptions = {},
): ValidationReport {
  const warnings: ValidationWarning[] = [];
  const buffer = PACE_BUFFER_MINUTES[options.pace ?? "BALANCED"];

  for (const day of days) {
    const items = [...day.items].sort(
      (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime),
    );

    if (items.length === 0) {
      warnings.push({
        severity: "INFO",
        code: "EMPTY_DAY",
        message: `Day ${day.dayNumber} has nothing scheduled.`,
        suggestion: "Add something, or leave it deliberately open.",
        itemIds: [],
        dayNumber: day.dayNumber,
      });
      continue;
    }

    checkDayShape(day, items, warnings);

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      checkItem(day, item, options, warnings);

      const previous = items[index - 1];
      if (previous) checkTransition(day, previous, item, buffer, warnings);
    }
  }

  for (const title of options.unscheduledMustDos ?? []) {
    warnings.push({
      severity: "WARNING",
      code: "UNSCHEDULED_MUST_DO",
      message: `"${title}" is a must-do but nothing on the schedule covers it.`,
      suggestion:
        "Add it to a day, or drop it from the must-do list so the plan matches what you actually want.",
      itemIds: [],
      dayNumber: null,
    });
  }

  for (const budgetWarning of options.budgetWarnings ?? []) {
    warnings.push({
      severity: budgetWarning.severity,
      code: "BUDGET_OVERRUN",
      message: budgetWarning.message,
      itemIds: [],
      dayNumber: null,
    });
  }

  const counts: Record<ValidationSeverity, number> = {
    ERROR: 0,
    WARNING: 0,
    INFO: 0,
  };
  for (const warning of warnings) counts[warning.severity] += 1;

  return { warnings, counts, possible: counts.ERROR === 0 };
}

/** Checks that concern the day as a whole. */
function checkDayShape(
  day: ItineraryDay,
  items: TimelineItem[],
  warnings: ValidationWarning[],
): void {
  const first = items[0]!;
  const last = items[items.length - 1]!;

  const spanMinutes =
    (Date.parse(last.endTime) - Date.parse(first.startTime)) / 60_000;

  if (spanMinutes > LONG_DAY_MINUTES) {
    warnings.push({
      severity: "WARNING",
      code: "LONG_DAY",
      message: `Day ${day.dayNumber} runs ${formatDuration(
        Math.round(spanMinutes),
      )}, from ${clock(first.startTime)} to ${clock(last.endTime)}.`,
      suggestion: "Move something to another day, or accept a late finish.",
      itemIds: [first.id, last.id],
      dayNumber: day.dayNumber,
    });
  }

  // A day with real commitments and no meal on it is a day somebody
  // forgot to eat.
  const scheduledMinutes = items.reduce(
    (sum, item) => sum + item.durationMinutes,
    0,
  );
  const hasMeal = items.some((item) => item.type === "RESTAURANT");
  if (!hasMeal && scheduledMinutes > 6 * 60) {
    warnings.push({
      severity: "WARNING",
      code: "NO_MEAL",
      message: `Day ${day.dayNumber} has ${formatDuration(
        scheduledMinutes,
      )} scheduled and no meal.`,
      suggestion: "Add a meal, or expect to eat on the move.",
      itemIds: [],
      dayNumber: day.dayNumber,
    });
  }

  // The opposite failure: every item is a meal and nothing else. Two
  // restaurants with a five-hour gap between them is not a light day, it
  // is a day the model filled with placeholders — a real symptom of the
  // planner running out of things to schedule, not a traveler's choice to
  // rest.
  const onlyMeals =
    items.length >= 2 && items.every((item) => item.type === "RESTAURANT");
  if (onlyMeals) {
    warnings.push({
      severity: "WARNING",
      code: "ONLY_MEALS",
      message: `Day ${day.dayNumber} has ${items.length} items, and every one of them is a meal.`,
      suggestion: "Add sightseeing or an activity between the meals.",
      itemIds: items.map((item) => item.id),
      dayNumber: day.dayNumber,
    });
  }
}

/** Checks that concern a single item. */
function checkItem(
  day: ItineraryDay,
  item: TimelineItem,
  options: ValidateOptions,
  warnings: ValidationWarning[],
): void {
  const startMinute = minuteOfDay(item.startTime);
  const endMinute = startMinute + item.durationMinutes;

  const hours = options.hoursByItemId?.get(item.id);
  if (hours) {
    if (startMinute < hours.opensMinute) {
      warnings.push({
        severity: "ERROR",
        code: "BEFORE_OPENING",
        message: `${item.title} is scheduled for ${clock(
          item.startTime,
        )} but does not open until ${minuteToClock(hours.opensMinute)}.`,
        suggestion: `Start no earlier than ${minuteToClock(hours.opensMinute)}.`,
        itemIds: [item.id],
        dayNumber: day.dayNumber,
      });
    } else if (endMinute > hours.closesMinute) {
      warnings.push({
        severity: "ERROR",
        code: "AFTER_CLOSING",
        message: `${item.title} runs until ${minuteToClock(
          endMinute,
        )} but closes at ${minuteToClock(hours.closesMinute)}.`,
        suggestion: `Start by ${minuteToClock(
          hours.closesMinute - item.durationMinutes,
        )}, or shorten the visit.`,
        itemIds: [item.id],
        dayNumber: day.dayNumber,
      });
    }
  }

  if (item.type === "RESTAURANT" && item.durationMinutes < MIN_MEAL_MINUTES) {
    warnings.push({
      severity: "WARNING",
      code: "SHORT_MEAL",
      message: `${formatDuration(item.durationMinutes)} is not long enough for ${item.title}.`,
      suggestion: `Allow at least ${MIN_MEAL_MINUTES} minutes.`,
      itemIds: [item.id],
      dayNumber: day.dayNumber,
    });
  }

  // An AI-written description is generated alongside the schedule, not
  // derived from it — the model can describe "the 8PM concert" and
  // separately schedule the item at 11:59 PM in the same response, an
  // internal inconsistency no schema check catches, because both values are
  // individually valid. This catches the one place that contradiction is
  // visible: the item's own words versus its own start time.
  const mentionedMinute = extractMentionedTime(
    `${item.title} ${item.description ?? ""}`,
  );
  if (
    mentionedMinute !== null &&
    Math.abs(mentionedMinute - startMinute) > TIME_MENTION_TOLERANCE_MINUTES
  ) {
    warnings.push({
      severity: "WARNING",
      code: "DESCRIPTION_TIME_MISMATCH",
      message: `${item.title} is scheduled for ${clock(
        item.startTime,
      )}, but its own description mentions ${minuteToClock(mentionedMinute)}.`,
      suggestion: `Move it to ${minuteToClock(mentionedMinute)}, or edit the description if that time is wrong.`,
      itemIds: [item.id],
      dayNumber: day.dayNumber,
    });
  }

  const dayStart = options.dayStartMinute;
  const dayEnd = options.dayEndMinute;
  if (dayStart !== undefined && startMinute < dayStart) {
    warnings.push({
      severity: "WARNING",
      code: "OUTSIDE_TRAVEL_HOURS",
      message: `${item.title} starts at ${clock(
        item.startTime,
      )}, earlier than the ${minuteToClock(dayStart)} you asked to start.`,
      itemIds: [item.id],
      dayNumber: day.dayNumber,
    });
  }
  if (dayEnd !== undefined && endMinute > dayEnd) {
    warnings.push({
      severity: "WARNING",
      code: "OUTSIDE_TRAVEL_HOURS",
      message: `${item.title} runs until ${minuteToClock(
        endMinute,
      )}, later than the ${minuteToClock(dayEnd)} you asked to finish.`,
      itemIds: [item.id],
      dayNumber: day.dayNumber,
    });
  }

  // Lodging conventions. Neither is fatal — hotels hold bags — so these are
  // information rather than errors.
  if (item.type === "LODGING") {
    if (day.dayNumber === 1 && startMinute < 15 * 60) {
      warnings.push({
        severity: "INFO",
        code: "EARLY_CHECK_IN",
        message: `Check-in is scheduled for ${clock(
          item.startTime,
        )}, before the usual 3:00 PM.`,
        suggestion: "Expect to leave bags at the desk rather than get a room.",
        itemIds: [item.id],
        dayNumber: day.dayNumber,
      });
    }
    if (startMinute > 11 * 60 && item.title.toLowerCase().includes("check out")) {
      warnings.push({
        severity: "WARNING",
        code: "LATE_CHECK_OUT",
        message: `Check-out is scheduled for ${clock(
          item.startTime,
        )}, after the usual 11:00 AM.`,
        suggestion: "Confirm a late check-out, or move it earlier.",
        itemIds: [item.id],
        dayNumber: day.dayNumber,
      });
    }
  }

  for (const leg of item.legs) {
    if (leg.distanceMeters === null || leg.durationMinutes <= 0) continue;
    const speed = leg.distanceMeters / leg.durationMinutes;
    const ceiling = MAX_SPEED[leg.mode] ?? MAX_SPEED.OTHER!;
    if (speed > ceiling) {
      warnings.push({
        severity: "ERROR",
        code: "IMPLAUSIBLE_TRAVEL_SPEED",
        message: `Getting to ${item.title} assumes covering ${Math.round(
          leg.distanceMeters,
        )} m in ${formatDuration(leg.durationMinutes)}, which is faster than ${
          leg.mode.toLowerCase()
        } goes.`,
        suggestion: "Allow more time for this leg, or use a faster mode.",
        itemIds: [item.id],
        dayNumber: day.dayNumber,
      });
      break;
    }
  }
}

/** Checks that concern the move from one item to the next. */
function checkTransition(
  day: ItineraryDay,
  previous: TimelineItem,
  current: TimelineItem,
  bufferMinutes: number,
  warnings: ValidationWarning[],
): void {
  const previousEnd = Date.parse(previous.endTime);
  const currentStart = Date.parse(current.startTime);
  const gapMinutes = (currentStart - previousEnd) / 60_000;

  if (gapMinutes < 0) {
    warnings.push({
      severity: "ERROR",
      code: "OVERLAP",
      message: `${previous.title} runs until ${clock(
        previous.endTime,
      )} but ${current.title} starts at ${clock(current.startTime)}.`,
      suggestion: `Move ${current.title} later, or shorten ${previous.title}.`,
      itemIds: [previous.id, current.id],
      dayNumber: day.dayNumber,
    });
    return;
  }

  const travelMinutes = travelMinutesInto(current);

  if (travelMinutes > 0) {
    if (gapMinutes < travelMinutes) {
      warnings.push({
        severity: "ERROR",
        code: "INSUFFICIENT_TRAVEL_TIME",
        message: `${previous.title} ends at ${clock(
          previous.endTime,
        )} but ${current.title} begins at ${clock(
          current.startTime,
        )} and estimated travel time is ${formatDuration(travelMinutes)}.`,
        suggestion: `Leave ${previous.title} by ${minuteToClock(
          minuteOfDay(current.startTime) - travelMinutes,
        )}, or move ${current.title} later.`,
        itemIds: [previous.id, current.id],
        dayNumber: day.dayNumber,
      });
      return;
    }

    if (gapMinutes - travelMinutes < bufferMinutes) {
      warnings.push({
        severity: "WARNING",
        code: "TIGHT_CONNECTION",
        message: `Only ${formatDuration(
          Math.round(gapMinutes - travelMinutes),
        )} spare between ${previous.title} and ${current.title}.`,
        suggestion: "Anything running late here puts the rest of the day behind.",
        itemIds: [previous.id, current.id],
        dayNumber: day.dayNumber,
      });
    }
  } else if (hasPoint(previous) && hasPoint(current)) {
    // No journey scheduled. Fine if they are the same place; not otherwise.
    const apart = distanceMeters(
      { latitude: previous.latitude!, longitude: previous.longitude! },
      { latitude: current.latitude!, longitude: current.longitude! },
    );
    if (apart > SAME_PLACE_METERS) {
      warnings.push({
        severity: "ERROR",
        code: "MISSING_TRANSPORTATION",
        message: `Nothing is scheduled to get from ${previous.title} to ${
          current.title
        }, which are ${Math.round(apart)} m apart.`,
        suggestion: "Add the journey so its time and cost are accounted for.",
        itemIds: [previous.id, current.id],
        dayNumber: day.dayNumber,
      });
    }
  }

  // Flights need the airport buffer, not just the travel time.
  if (current.type === "TRAVEL" && gapMinutes >= 0) {
    const available = gapMinutes - travelMinutes;
    if (available < AIRPORT_BUFFER_MINUTES) {
      warnings.push({
        severity: "WARNING",
        code: "AIRPORT_ARRIVAL_BUFFER",
        message: `${current.title} leaves ${formatDuration(
          Math.round(Math.max(0, available)),
        )} at the terminal after travel.`,
        suggestion: `Allow ${AIRPORT_BUFFER_MINUTES} minutes for check-in and security.`,
        itemIds: [previous.id, current.id],
        dayNumber: day.dayNumber,
      });
    }
  }
}

function minuteToClock(minute: number): string {
  const normalized = ((minute % 1_440) + 1_440) % 1_440;
  const hour24 = Math.floor(normalized / 60);
  const minutes = String(normalized % 60).padStart(2, "0");
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

const TIME_MENTION_TOLERANCE_MINUTES = 90;

/**
 * Loosely extracts a single clock time mentioned in free text, like "8PM" or
 * "6:30 pm". Returns null when nothing matches — most items mention no time
 * at all, and that is not itself suspicious.
 *
 * Requiring the am/pm suffix is deliberate: without it, "built in 1900"
 * would read as "19:00". A plain 24-hour time with no am/pm marker is
 * genuinely ambiguous in prose and not worth guessing at.
 */
function extractMentionedTime(text: string): number | null {
  const match = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (!match) return null;

  let hour = Number.parseInt(match[1]!, 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const isPm = match[3]!.toLowerCase() === "pm";

  if (hour === 12) hour = isPm ? 12 : 0;
  else if (isPm) hour += 12;

  return hour * 60 + minute;
}
