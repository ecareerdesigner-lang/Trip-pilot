import { describe, it, expect } from "vitest";
import {
  newItemSchema,
  updateItemSchema,
  type NewItemPayload,
} from "@/lib/validation/itinerary-item";

const VALID: NewItemPayload = {
  tripDayId: "11111111-1111-4111-8111-111111111111",
  type: "SIGHTSEEING",
  title: "Empire State Building",
  description: "",
  startMinute: 600,
  durationMinutes: 90,
  locationName: "350 5th Ave",
  latitude: 40.7484,
  longitude: -73.9857,
  estimatedCostCents: 4400,
  reservationRequired: false,
};

function parseNew(overrides: Partial<NewItemPayload> = {}) {
  return newItemSchema.safeParse({ ...VALID, ...overrides });
}

function errorFor(
  result: ReturnType<typeof parseNew>,
  path: string,
): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path.join(".") === path)
    ?.message;
}

describe("newItemSchema", () => {
  it("accepts a fully specified item", () => {
    expect(parseNew().success).toBe(true);
  });

  it("requires a real UUID for the trip day, not any non-empty string", () => {
    const result = parseNew({ tripDayId: "day-1" });
    expect(result.success).toBe(false);
    expect(errorFor(result, "tripDayId")).toBe("Pick a day.");
  });

  it("rejects a type outside the known set", () => {
    // @ts-expect-error - deliberately invalid for the test
    const result = parseNew({ type: "SIGHTSEEING_BUT_MADE_UP" });
    expect(result.success).toBe(false);
  });

  it("requires a title with real content", () => {
    for (const bad of ["", " ", "A"]) {
      const result = parseNew({ title: bad });
      expect(result.success).toBe(false);
      expect(errorFor(result, "title")).toBe("Give this a name.");
    }
  });

  it("trims the title before checking its length", () => {
    // Two real characters surrounded by whitespace should pass; the trim
    // matters because a title of "  A  " is not obviously two characters at
    // a glance if trim is silently skipped.
    expect(parseNew({ title: "  AB  " }).success).toBe(true);
  });

  it("caps the title at 160 characters", () => {
    expect(parseNew({ title: "a".repeat(160) }).success).toBe(true);
    expect(parseNew({ title: "a".repeat(161) }).success).toBe(false);
  });

  it("caps the description at 600 characters and defaults to empty", () => {
    expect(parseNew({ description: "a".repeat(600) }).success).toBe(true);
    expect(parseNew({ description: "a".repeat(601) }).success).toBe(false);

    const { description: _description, ...withoutDescription } = VALID;
    const result = newItemSchema.safeParse(withoutDescription);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe("");
  });

  it("keeps startMinute inside a single day, 0 to 1439", () => {
    expect(parseNew({ startMinute: 0 }).success).toBe(true);
    expect(parseNew({ startMinute: 1_439 }).success).toBe(true);
    expect(parseNew({ startMinute: -1 }).success).toBe(false);
    expect(parseNew({ startMinute: 1_440 }).success).toBe(false);
    expect(parseNew({ startMinute: 90.5 }).success).toBe(false);
  });

  it("requires at least five minutes and at most twelve hours", () => {
    expect(parseNew({ durationMinutes: 5 }).success).toBe(true);
    expect(parseNew({ durationMinutes: 720 }).success).toBe(true);
    expect(parseNew({ durationMinutes: 4 }).success).toBe(false);
    expect(parseNew({ durationMinutes: 721 }).success).toBe(false);
  });

  it("keeps latitude and longitude within real coordinate bounds", () => {
    expect(parseNew({ latitude: 90, longitude: 180 }).success).toBe(true);
    expect(parseNew({ latitude: -90, longitude: -180 }).success).toBe(true);
    expect(parseNew({ latitude: 90.1 }).success).toBe(false);
    expect(parseNew({ longitude: -180.1 }).success).toBe(false);
  });

  it("allows coordinates to be left out entirely, defaulting to null", () => {
    const { latitude: _latitude, longitude: _longitude, ...withoutCoords } = VALID;
    const result = newItemSchema.safeParse(withoutCoords);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latitude).toBeNull();
      expect(result.data.longitude).toBeNull();
    }
  });

  it("rejects a negative or fractional cost", () => {
    expect(parseNew({ estimatedCostCents: 0 }).success).toBe(true);
    expect(parseNew({ estimatedCostCents: -1 }).success).toBe(false);
    expect(parseNew({ estimatedCostCents: 4.5 }).success).toBe(false);
  });

  it("defaults estimatedCostCents and reservationRequired when omitted", () => {
    const { estimatedCostCents: _estimatedCostCents, reservationRequired: _reservationRequired, ...rest } = VALID;
    const result = newItemSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCostCents).toBe(0);
      expect(result.data.reservationRequired).toBe(false);
    }
  });
});

describe("updateItemSchema", () => {
  it("accepts a single changed field", () => {
    expect(updateItemSchema.safeParse({ title: "New name" }).success).toBe(
      true,
    );
  });

  it("rejects an empty patch", () => {
    // The schema's own reason for existing: a PATCH with nothing in it is
    // not a valid request, it is a bug in whatever built it.
    const result = updateItemSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Nothing to change.");
    }
  });

  it("allows shiftFollowingBy to move earlier or later, within a day", () => {
    expect(
      updateItemSchema.safeParse({ shiftFollowingBy: -720 }).success,
    ).toBe(true);
    expect(
      updateItemSchema.safeParse({ shiftFollowingBy: 720 }).success,
    ).toBe(true);
    expect(
      updateItemSchema.safeParse({ shiftFollowingBy: -721 }).success,
    ).toBe(false);
    expect(
      updateItemSchema.safeParse({ shiftFollowingBy: 721 }).success,
    ).toBe(false);
  });

  it("keeps the same title, duration and startMinute bounds as a new item", () => {
    expect(updateItemSchema.safeParse({ title: "A" }).success).toBe(false);
    expect(
      updateItemSchema.safeParse({ durationMinutes: 4 }).success,
    ).toBe(false);
    expect(updateItemSchema.safeParse({ startMinute: 1_440 }).success).toBe(
      false,
    );
  });

  it("accepts a plain completed toggle with nothing else", () => {
    expect(updateItemSchema.safeParse({ completed: true }).success).toBe(
      true,
    );
  });
});
