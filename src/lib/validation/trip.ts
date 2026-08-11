import { z } from "zod";
import type {
  FoodPreference,
  Pace,
  TransportPreference,
  TransportationIntent,
  TravelMethod,
} from "@/types/domain";
import {
  FOOD_PREFERENCES,
  PACES,
  TRANSPORTATION_INTENTS,
  TRANSPORT_PREFERENCES,
  TRAVEL_METHODS,
} from "@/types/domain";

/**
 * Trip input validation.
 *
 * One schema, used by the wizard in the browser and again on the server. The
 * client copy makes errors immediate; the server copy is the one that counts,
 * because anything reaching a route handler may not have come from the form.
 *
 * Money is entered in dollars as text and converted to cents at the boundary
 * by `toTripPayload`. Nothing downstream ever sees a dollar amount.
 */

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_TEXT = /^\d{1,7}(\.\d{1,2})?$/;

/** Blank means "not specified", which is different from zero. */
const moneyText = z
  .string({ message: "Enter an amount like 3000, or leave it blank." })
  .trim()
  .refine((value) => value === "" || MONEY_TEXT.test(value), {
    message: "Enter an amount like 3000 or 2999.50.",
  });

const calendarDate = z
  .string({ message: "Pick a date." })
  .trim()
  .regex(CALENDAR_DATE, { message: "Pick a date." });

export const mustDoInputSchema = z.object({
  title: z
    .string({ message: "Give this a name." })
    .trim()
    .min(2, { message: "Give this a name." })
    .max(120, { message: "Keep this under 120 characters." }),
  description: z
    .string({ message: "Details must be text." })
    .trim()
    .max(500, { message: "Keep this under 500 characters." })
    .default(""),
});

export const tripFormSchema = z
  .object({
    // Step 1 — destination
    origin: z
      .string({ message: "Where are you starting from?" })
      .trim()
      .min(2, { message: "Where are you starting from?" })
      .max(120),
    destination: z
      .string({ message: "Where are you going?" })
      .trim()
      .min(2, { message: "Where are you going?" })
      .max(120),
    startDate: calendarDate,
    endDate: calendarDate,
    travelers: z
      .number({ message: "How many people are going?" })
      .int({ message: "Whole people only." })
      .min(1, { message: "At least one traveler." })
      .max(20, { message: "Twenty travelers is the most this handles." }),
    name: z.string({ message: "Trip name must be text." }).trim().max(80).default(""),

    // Step 2 — transportation
    travelMethod: z.enum(TRAVEL_METHODS, {
      message: "Pick how you are travelling there.",
    }),
    transportationIntent: z.enum(TRANSPORTATION_INTENTS, {
      message: "Pick what TripPilot should do about transportation.",
    }),

    // Step 3 — budget
    totalBudget: moneyText,
    transportationBudget: moneyText,
    lodgingBudget: moneyText,
    foodBudget: moneyText,
    activityBudget: moneyText,
    localTransportationBudget: moneyText,

    // Step 4 — preferences
    pace: z.enum(PACES, { message: "Pick a pace." }),
    foodPreference: z.enum(FOOD_PREFERENCES, {
      message: "Pick a food preference.",
    }),
    transportPreferences: z.array(z.enum(TRANSPORT_PREFERENCES)).default([]),

    // Step 5 — must-dos
    mustDos: z
      .array(mustDoInputSchema)
      .max(30, { message: "Thirty must-dos is the most this handles." })
      .default([]),

    // Step 6 — notes
    notes: z
      .string({ message: "Notes must be text." })
      .trim()
      .max(2000, { message: "Keep notes under 2000 characters." })
      .default(""),
  })
  .superRefine((value, ctx) => {
    if (CALENDAR_DATE.test(value.startDate) && CALENDAR_DATE.test(value.endDate)) {
      if (value.endDate < value.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "The return date is before the departure date.",
        });
      } else if (tripNights(value.startDate, value.endDate) > 60) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "Trips longer than 60 nights are not supported yet.",
        });
      }
    }

    // Category budgets may not exceed the total. Caught here rather than at
    // generation time, when it would be a confusing surprise.
    const total = parseMoneyText(value.totalBudget);
    if (total !== null) {
      const categories = [
        value.transportationBudget,
        value.lodgingBudget,
        value.foodBudget,
        value.activityBudget,
        value.localTransportationBudget,
      ]
        .map(parseMoneyText)
        .filter((cents): cents is number => cents !== null);

      const allocated = categories.reduce((sum, cents) => sum + cents, 0);
      if (allocated > total) {
        ctx.addIssue({
          code: "custom",
          path: ["totalBudget"],
          message:
            "The category amounts add up to more than the total budget.",
        });
      }
    }
  });

/**
 * What the form holds while it is being filled in.
 *
 * Stated explicitly rather than derived from `z.input`, because fields with
 * `.default()` are optional on the input side — and a form whose fields are
 * optional in the type system is a form where a typo silently compiles.
 * Every field here is present from the first render.
 */
export interface TripFormValues {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  name: string;
  travelMethod: TravelMethod;
  transportationIntent: TransportationIntent;
  totalBudget: string;
  transportationBudget: string;
  lodgingBudget: string;
  foodBudget: string;
  activityBudget: string;
  localTransportationBudget: string;
  pace: Pace;
  foodPreference: FoodPreference;
  transportPreferences: TransportPreference[];
  mustDos: { title: string; description: string }[];
  notes: string;
}

export type TripFormParsed = z.output<typeof tripFormSchema>;

export const EMPTY_TRIP_FORM: TripFormValues = {
  origin: "",
  destination: "",
  startDate: "",
  endDate: "",
  travelers: 2,
  name: "",
  travelMethod: "FLIGHT",
  transportationIntent: "SEARCH",
  totalBudget: "",
  transportationBudget: "",
  lodgingBudget: "",
  foodBudget: "",
  activityBudget: "",
  localTransportationBudget: "",
  pace: "BALANCED",
  foodPreference: "NO_PREFERENCE",
  transportPreferences: [],
  mustDos: [],
  notes: "",
};

/** Dollars as typed text to integer cents. Blank returns null, not zero. */
export function parseMoneyText(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || !MONEY_TEXT.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

function tripNights(startDate: string, endDate: string): number {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * The shape the API and database work in: cents, nulls for unspecified, and
 * a trip name that is never blank.
 */
export interface TripPayload {
  name: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  travelMethod: TripFormParsed["travelMethod"];
  transportationIntent: TripFormParsed["transportationIntent"];
  totalBudgetCents: number | null;
  transportationBudgetCents: number | null;
  lodgingBudgetCents: number | null;
  foodBudgetCents: number | null;
  activityBudgetCents: number | null;
  localTransportationBudgetCents: number | null;
  pace: TripFormParsed["pace"];
  foodPreference: TripFormParsed["foodPreference"];
  transportPreferences: TripFormParsed["transportPreferences"];
  mustDos: { title: string; description: string }[];
  notes: string;
}

export function toTripPayload(values: TripFormParsed): TripPayload {
  return {
    name: values.name.trim() || defaultTripName(values.destination, values.startDate),
    origin: values.origin,
    destination: values.destination,
    startDate: values.startDate,
    endDate: values.endDate,
    travelers: values.travelers,
    travelMethod: values.travelMethod,
    transportationIntent: values.transportationIntent,
    totalBudgetCents: parseMoneyText(values.totalBudget),
    transportationBudgetCents: parseMoneyText(values.transportationBudget),
    lodgingBudgetCents: parseMoneyText(values.lodgingBudget),
    foodBudgetCents: parseMoneyText(values.foodBudget),
    activityBudgetCents: parseMoneyText(values.activityBudget),
    localTransportationBudgetCents: parseMoneyText(
      values.localTransportationBudget,
    ),
    pace: values.pace,
    foodPreference: values.foodPreference,
    transportPreferences: values.transportPreferences,
    mustDos: values.mustDos,
    notes: values.notes,
  };
}

/** "New York City, Sep 2026" — used when the traveler does not name the trip. */
export function defaultTripName(destination: string, startDate: string): string {
  const place = destination.trim().split(",")[0]?.trim() || "Trip";
  if (!CALENDAR_DATE.test(startDate)) return place;

  const when = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${startDate}T00:00:00Z`));

  return `${place}, ${when}`;
}

/** Fields belonging to each wizard step, for per-step validation. */
export const STEP_FIELDS = [
  ["origin", "destination", "startDate", "endDate", "travelers", "name"],
  ["travelMethod", "transportationIntent"],
  [
    "totalBudget",
    "transportationBudget",
    "lodgingBudget",
    "foodBudget",
    "activityBudget",
    "localTransportationBudget",
  ],
  ["pace", "foodPreference", "transportPreferences"],
  ["mustDos"],
  ["notes"],
  [],
] as const satisfies ReadonlyArray<ReadonlyArray<keyof TripFormValues>>;
