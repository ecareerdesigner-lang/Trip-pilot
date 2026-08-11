import { BUDGET_CATEGORIES, type BudgetCategory } from "@/types/domain";
import type { TripPayload } from "@/lib/validation/trip";

/**
 * Turning a validated wizard payload into the rows a trip is made of.
 *
 * Pure on purpose. Day generation and the budget ledger are where an
 * off-by-one costs a traveler a night's lodging, so they are unit tested
 * rather than exercised only through the database.
 */

/** Parse a calendar date as UTC midnight, never local. */
export function calendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export interface TripDayRow {
  dayNumber: number;
  date: Date;
}

/**
 * One row per calendar day, inclusive of both ends.
 *
 * A trip from the 18th to the 21st is four days, not three: the traveler is
 * present on the departure day and the return day, and both need a schedule.
 */
export function buildTripDays(startDate: string, endDate: string): TripDayRow[] {
  const start = calendarDate(startDate);
  const end = calendarDate(endDate);

  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (span < 0) return [];

  return Array.from({ length: span + 1 }, (_, index) => ({
    dayNumber: index + 1,
    date: new Date(start.getTime() + index * 86_400_000),
  }));
}

export interface BudgetRow {
  category: BudgetCategory;
  plannedCents: number;
  actualCents: number;
}

/**
 * The ledger starts empty.
 *
 * `plannedCents` is derived from itinerary estimates, and a new trip has no
 * itinerary. Seeding it with the traveler's allocation would double-count:
 * the allocation already lives on the trip, and variance is computed from
 * the two. Six rows exist from the start so later writes are updates rather
 * than upserts.
 */
export function buildBudgetLedger(): BudgetRow[] {
  return BUDGET_CATEGORIES.map((category) => ({
    category,
    plannedCents: 0,
    actualCents: 0,
  }));
}

/**
 * Scalar fields for the trip row, with dates converted and money already in
 * cents. Relations are created separately by the repository.
 */
export function buildTripScalars(payload: TripPayload) {
  return {
    name: payload.name,
    origin: payload.origin,
    destination: payload.destination,
    startDate: calendarDate(payload.startDate),
    endDate: calendarDate(payload.endDate),
    travelers: payload.travelers,
    travelMethod: payload.travelMethod,
    transportationIntent: payload.transportationIntent,
    totalBudgetCents: payload.totalBudgetCents,
    transportationBudgetCents: payload.transportationBudgetCents,
    lodgingBudgetCents: payload.lodgingBudgetCents,
    foodBudgetCents: payload.foodBudgetCents,
    activityBudgetCents: payload.activityBudgetCents,
    localTransportationBudgetCents: payload.localTransportationBudgetCents,
    notes: payload.notes.trim() || null,
  };
}

/** Must-dos arrive from the wizard as requirements, none of them scheduled. */
export function buildMustDoRows(payload: TripPayload) {
  return payload.mustDos
    .filter((mustDo) => mustDo.title.trim().length > 0)
    .map((mustDo) => ({
      title: mustDo.title.trim(),
      description: mustDo.description.trim() || null,
      status: "UNSCHEDULED" as const,
      priority: "REQUIRED" as const,
    }));
}

export function buildPreferenceRow(payload: TripPayload) {
  return {
    pace: payload.pace,
    foodPreference: payload.foodPreference,
    transportPreferences: payload.transportPreferences,
    interests: [] as string[],
    dietaryRestrictions: [] as string[],
  };
}
