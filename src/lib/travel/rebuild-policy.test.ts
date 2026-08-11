import { describe, it, expect } from "vitest";
import {
  REPLACED_ON_REBUILD,
  resetsOnRebuild,
  survivesRebuild,
} from "@/lib/travel/rebuild-policy";
import { ITEM_SOURCES, MUST_DO_STATUSES } from "@/types/domain";

describe("survivesRebuild", () => {
  it("keeps what the traveler added by hand", () => {
    expect(survivesRebuild("USER")).toBe(true);
  });

  it("replaces everything the app generated", () => {
    expect(survivesRebuild("AI_SUGGESTION")).toBe(false);
    expect(survivesRebuild("SYSTEM")).toBe(false);
    expect(survivesRebuild("PROVIDER")).toBe(false);
  });

  it("replaces an item that satisfies a must-do", () => {
    // The regression this exists for: MUST_DO was excluded from the rebuild,
    // so every regeneration left the old copy behind and added another. Three
    // rebuilds produced three copies of the same museum on the same day.
    expect(survivesRebuild("MUST_DO")).toBe(false);
  });

  it("covers every source, so a new one cannot be forgotten", () => {
    for (const source of ITEM_SOURCES) {
      const survives = survivesRebuild(source);
      const replaced = REPLACED_ON_REBUILD.includes(source);
      expect(
        survives !== replaced,
        `${source} must either survive or be replaced, not both or neither`,
      ).toBe(true);
    }
  });

  it("lists exactly the sources it replaces", () => {
    const replaced = ITEM_SOURCES.filter((source) => !survivesRebuild(source));
    expect([...REPLACED_ON_REBUILD].sort()).toEqual([...replaced].sort());
  });
});

describe("resetsOnRebuild", () => {
  it("unschedules a must-do whose item is being replaced", () => {
    expect(resetsOnRebuild("SCHEDULED")).toBe(true);
    expect(resetsOnRebuild("UNSCHEDULED")).toBe(true);
    expect(resetsOnRebuild("DROPPED")).toBe(true);
  });

  it("leaves a completed must-do alone", () => {
    expect(resetsOnRebuild("COMPLETED")).toBe(false);
  });

  it("has an answer for every status", () => {
    for (const status of MUST_DO_STATUSES) {
      expect(typeof resetsOnRebuild(status)).toBe("boolean");
    }
  });
});
