import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as domain from "@/types/domain";

/**
 * `src/types/domain.ts` mirrors the Prisma enums by hand so the engines and
 * the UI do not need a generated client. This test makes drift fail here
 * instead of at runtime.
 */

const schema = readFileSync(
  path.join(process.cwd(), "prisma", "schema.prisma"),
  "utf8",
);

function enumMembers(name: string): string[] {
  const match = schema.match(
    new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`, "m"),
  );
  if (!match?.[1]) throw new Error(`enum ${name} not found in schema.prisma`);

  return match[1]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => line.length > 0 && /^[A-Z0-9_]+$/.test(line));
}

const PAIRS: ReadonlyArray<[string, readonly string[]]> = [
  ["TripStatus", domain.TRIP_STATUSES],
  ["ItineraryItemType", domain.ITINERARY_ITEM_TYPES],
  ["TransportMode", domain.TRANSPORT_MODES],
  ["TravelMethod", domain.TRAVEL_METHODS],
  ["TransportationIntent", domain.TRANSPORTATION_INTENTS],
  ["ReservationStatus", domain.RESERVATION_STATUSES],
  ["BudgetCategory", domain.BUDGET_CATEGORIES],
  ["Pace", domain.PACES],
  ["FoodPreference", domain.FOOD_PREFERENCES],
  ["TransportPreference", domain.TRANSPORT_PREFERENCES],
  ["ItemSource", domain.ITEM_SOURCES],
  ["Priority", domain.PRIORITIES],
  ["MustDoStatus", domain.MUST_DO_STATUSES],
  ["LocationKind", domain.LOCATION_KINDS],
  ["TravelDocumentType", domain.TRAVEL_DOCUMENT_TYPES],
];

describe("domain enums match prisma/schema.prisma", () => {
  for (const [enumName, values] of PAIRS) {
    it(enumName, () => {
      expect([...values].sort()).toEqual(enumMembers(enumName).sort());
    });
  }
});
