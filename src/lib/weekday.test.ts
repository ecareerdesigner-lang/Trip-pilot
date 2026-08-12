import { describe, it, expect } from "vitest";
import {
  describeDate,
  matchesRequestedWeekday,
  weekdayOf,
  weekdaysMentioned,
} from "@/lib/weekday";

describe("weekdayOf", () => {
  it("gets the weekday right", () => {
    // The dates from the trip that exposed this: Aug 27 2026 is a Thursday,
    // Aug 28 is a Friday. The model claimed the 28th was Thursday.
    expect(weekdayOf("2026-08-27")).toBe("thursday");
    expect(weekdayOf("2026-08-28")).toBe("friday");
  });

  it("does not shift across a timezone", () => {
    // Read with local getters, "2026-03-01" is Feb 28 anywhere west of UTC.
    expect(weekdayOf("2026-03-01")).toBe("sunday");
    expect(weekdayOf("2026-01-01")).toBe("thursday");
  });

  it("returns null for an unparseable date", () => {
    expect(weekdayOf("not-a-date")).toBeNull();
    expect(weekdayOf("")).toBeNull();
  });
});

describe("describeDate", () => {
  it("names the weekday", () => {
    expect(describeDate("2026-08-28")).toContain("Friday");
    expect(describeDate("2026-08-27")).toContain("Thursday");
  });

  it("passes an unparseable date through unchanged", () => {
    expect(describeDate("nonsense")).toBe("nonsense");
  });
});

describe("weekdaysMentioned", () => {
  it("finds a weekday in a request", () => {
    expect(weekdaysMentioned("Move the museum to Thursday")).toEqual([
      "thursday",
    ]);
  });

  it("is case insensitive", () => {
    expect(weekdaysMentioned("move it to FRIDAY")).toEqual(["friday"]);
  });

  it("finds more than one", () => {
    const found = weekdaysMentioned("Thursday or Friday, either is fine");
    expect(found).toContain("thursday");
    expect(found).toContain("friday");
  });

  it("understands common abbreviations", () => {
    expect(weekdaysMentioned("move it to thurs")).toEqual(["thursday"]);
    expect(weekdaysMentioned("weds works")).toEqual(["wednesday"]);
  });

  it("does not match inside another word", () => {
    // "Sundance", "Satisfy", "Montreal" must not register.
    expect(weekdaysMentioned("the Sundance festival")).toEqual([]);
    expect(weekdaysMentioned("something satisfying")).toEqual([]);
    expect(weekdaysMentioned("a trip to Montreal")).toEqual([]);
  });

  it("finds nothing when no weekday was named", () => {
    expect(weekdaysMentioned("make the day more relaxed")).toEqual([]);
  });
});

describe("matchesRequestedWeekday", () => {
  it("accepts a date that matches the request", () => {
    expect(matchesRequestedWeekday("2026-08-27", "move it to Thursday")).toBe(
      true,
    );
  });

  it("rejects the mismatch that reached a real trip", () => {
    // "Move the museum to Thursday" produced a command targeting Aug 28,
    // which is a Friday, and it was applied.
    expect(matchesRequestedWeekday("2026-08-28", "Move the museum to thursday")).toBe(
      false,
    );
  });

  it("accepts any weekday when several were offered", () => {
    expect(
      matchesRequestedWeekday("2026-08-28", "Thursday or Friday works"),
    ).toBe(true);
  });

  it("has nothing to contradict when no weekday was named", () => {
    expect(matchesRequestedWeekday("2026-08-28", "move it later")).toBe(true);
  });

  it("rejects an unparseable date when a weekday was asked for", () => {
    expect(matchesRequestedWeekday("nonsense", "move it to Friday")).toBe(false);
  });
});
