import { describe, it, expect } from "vitest";
import {
  celsiusToFahrenheit,
  daysBetweenInclusive,
  formatDateRange,
  formatDistance,
  formatDuration,
  formatTemperatureRange,
  nightsBetween,
} from "@/lib/format";

describe("format", () => {
  it("formats durations the way a traveler reads them", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
    expect(formatDuration(0)).toBe("0 min");
  });

  it("counts nights and days across a trip", () => {
    expect(nightsBetween("2026-09-18", "2026-09-21")).toBe(3);
    expect(daysBetweenInclusive("2026-09-18", "2026-09-21")).toBe(4);
    expect(nightsBetween("2026-09-18", "2026-09-18")).toBe(0);
  });

  it("collapses a same-month range", () => {
    expect(formatDateRange("2026-03-04", "2026-03-09")).toBe("Mar 4 – 9, 2026");
  });

  it("keeps both months when a range crosses one", () => {
    expect(formatDateRange("2026-03-28", "2026-04-02")).toBe(
      "Mar 28 – Apr 2, 2026",
    );
  });

  it("keeps both years when a range crosses one", () => {
    expect(formatDateRange("2025-12-29", "2026-01-02")).toBe(
      "Dec 29, 2025 – Jan 2, 2026",
    );
  });

  it("switches distance units at readable thresholds", () => {
    expect(formatDistance(80)).toBe("262 ft");
    expect(formatDistance(3218)).toBe("2.0 mi");
    expect(formatDistance(800, "km")).toBe("800 m");
    expect(formatDistance(3200, "km")).toBe("3.2 km");
  });

  it("converts Celsius to Fahrenheit", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(celsiusToFahrenheit(22)).toBe(72);
    expect(celsiusToFahrenheit(-5)).toBe(23);
  });

  it("formats a temperature range as high then low, in Fahrenheit", () => {
    expect(formatTemperatureRange(24, 15)).toBe("75° / 59°");
    expect(formatTemperatureRange(0, -10)).toBe("32° / 14°");
  });
});
