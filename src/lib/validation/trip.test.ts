import { describe, it, expect } from "vitest";
import {
  EMPTY_TRIP_FORM,
  STEP_FIELDS,
  defaultTripName,
  parseMoneyText,
  toTripPayload,
  tripFormSchema,
  type TripFormValues,
} from "@/lib/validation/trip";

const VALID: TripFormValues = {
  origin: "Charlotte, NC",
  destination: "New York City",
  startDate: "2026-09-18",
  endDate: "2026-09-21",
  travelers: 2,
  name: "",
  travelMethod: "FLIGHT",
  transportationIntent: "SEARCH",
  totalBudget: "3000",
  transportationBudget: "",
  lodgingBudget: "",
  foodBudget: "",
  activityBudget: "",
  localTransportationBudget: "",
  pace: "BALANCED",
  foodPreference: "LOCAL_FAVORITES",
  transportPreferences: ["PUBLIC_TRANSPORT_PREFERRED"],
  mustDos: [{ title: "See a Broadway show", description: "" }],
  notes: "",
};

function parse(overrides: Partial<TripFormValues> = {}) {
  return tripFormSchema.safeParse({ ...VALID, ...overrides });
}

function errorFor(result: ReturnType<typeof parse>, path: string) {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path.join(".") === path)
    ?.message;
}

describe("parseMoneyText", () => {
  it("converts dollars to cents", () => {
    expect(parseMoneyText("3000")).toBe(300_000);
    expect(parseMoneyText("2999.50")).toBe(299_950);
    expect(parseMoneyText("0.99")).toBe(99);
  });

  it("treats blank as unspecified, not zero", () => {
    expect(parseMoneyText("")).toBeNull();
    expect(parseMoneyText("   ")).toBeNull();
  });

  it("rejects anything that is not a plain amount", () => {
    for (const bad of ["$3000", "3,000", "abc", "3.999", "-50", "1e5"]) {
      expect(parseMoneyText(bad)).toBeNull();
    }
  });

  it("does not drift on values that break float math", () => {
    expect(parseMoneyText("0.1")! + parseMoneyText("0.2")!).toBe(
      parseMoneyText("0.3"),
    );
  });
});

describe("tripFormSchema", () => {
  it("accepts a complete form", () => {
    expect(parse().success).toBe(true);
  });

  it("requires an origin and a destination", () => {
    expect(errorFor(parse({ origin: "" }), "origin")).toBeDefined();
    expect(errorFor(parse({ destination: "x" }), "destination")).toBeDefined();
  });

  it("rejects a return date before the departure date", () => {
    const result = parse({ startDate: "2026-09-21", endDate: "2026-09-18" });
    expect(errorFor(result, "endDate")).toMatch(/before the departure/i);
  });

  it("allows a same-day trip", () => {
    expect(parse({ startDate: "2026-09-18", endDate: "2026-09-18" }).success).toBe(
      true,
    );
  });

  it("rejects an implausibly long trip", () => {
    const result = parse({ startDate: "2026-01-01", endDate: "2026-06-01" });
    expect(errorFor(result, "endDate")).toMatch(/60 nights/i);
  });

  it("rejects a malformed date", () => {
    expect(errorFor(parse({ startDate: "09/18/2026" }), "startDate")).toBeDefined();
  });

  it("requires at least one traveler and caps the count", () => {
    expect(errorFor(parse({ travelers: 0 }), "travelers")).toBeDefined();
    expect(errorFor(parse({ travelers: 21 }), "travelers")).toBeDefined();
    expect(errorFor(parse({ travelers: 2.5 }), "travelers")).toBeDefined();
  });

  it("rejects money that is not a plain amount", () => {
    expect(errorFor(parse({ totalBudget: "$3,000" }), "totalBudget")).toBeDefined();
  });

  it("accepts a trip with no budget at all", () => {
    expect(parse({ totalBudget: "" }).success).toBe(true);
  });

  it("rejects category budgets that exceed the total", () => {
    const result = parse({
      totalBudget: "1000",
      lodgingBudget: "800",
      foodBudget: "500",
    });
    expect(errorFor(result, "totalBudget")).toMatch(/more than the total/i);
  });

  it("accepts category budgets that fit inside the total", () => {
    expect(
      parse({ totalBudget: "3000", lodgingBudget: "900", foodBudget: "600" })
        .success,
    ).toBe(true);
  });

  it("does not complain about categories when no total was given", () => {
    expect(parse({ totalBudget: "", lodgingBudget: "900" }).success).toBe(true);
  });

  it("requires a must-do to have a real title", () => {
    const result = parse({ mustDos: [{ title: "", description: "" }] });
    expect(errorFor(result, "mustDos.0.title")).toBeDefined();
  });

  it("accepts a trip with no must-dos", () => {
    expect(parse({ mustDos: [] }).success).toBe(true);
  });

  it("trims whitespace from text", () => {
    const result = parse({ origin: "  Charlotte, NC  " });
    expect(result.success && result.data.origin).toBe("Charlotte, NC");
  });
});

describe("defaultTripName", () => {
  it("uses the city and the month", () => {
    expect(defaultTripName("New York City", "2026-09-18")).toBe(
      "New York City, Sep 2026",
    );
  });

  it("drops anything after a comma in the destination", () => {
    expect(defaultTripName("Paris, France", "2026-05-02")).toBe(
      "Paris, May 2026",
    );
  });

  it("does not shift the month across a timezone boundary", () => {
    expect(defaultTripName("Boston", "2026-03-01")).toBe("Boston, Mar 2026");
  });

  it("falls back when the date is unusable", () => {
    expect(defaultTripName("Chicago", "")).toBe("Chicago");
  });
});

describe("toTripPayload", () => {
  it("converts every money field to cents", () => {
    const parsed = tripFormSchema.parse({
      ...VALID,
      totalBudget: "3000",
      lodgingBudget: "900",
    });
    const payload = toTripPayload(parsed);
    expect(payload.totalBudgetCents).toBe(300_000);
    expect(payload.lodgingBudgetCents).toBe(90_000);
  });

  it("leaves unspecified budgets null rather than zero", () => {
    const payload = toTripPayload(tripFormSchema.parse(VALID));
    expect(payload.foodBudgetCents).toBeNull();
    expect(payload.transportationBudgetCents).toBeNull();
  });

  it("names the trip when the traveler did not", () => {
    const payload = toTripPayload(tripFormSchema.parse(VALID));
    expect(payload.name).toBe("New York City, Sep 2026");
  });

  it("keeps a name the traveler chose", () => {
    const payload = toTripPayload(
      tripFormSchema.parse({ ...VALID, name: "Broadway weekend" }),
    );
    expect(payload.name).toBe("Broadway weekend");
  });
});

describe("STEP_FIELDS", () => {
  it("assigns every form field to exactly one step", () => {
    const assigned: string[] = STEP_FIELDS.flat();
    const formKeys = Object.keys(EMPTY_TRIP_FORM);

    // A field missing here would never be validated, because validation runs
    // per step. A field listed twice would report its error on two screens.
    for (const key of formKeys) {
      const count = assigned.filter((field) => field === key).length;
      expect(count, `${key} appears on ${count} steps`).toBe(1);
    }
    expect(assigned).toHaveLength(formKeys.length);
  });

  it("has one entry per wizard step", () => {
    expect(STEP_FIELDS).toHaveLength(7);
  });
});
