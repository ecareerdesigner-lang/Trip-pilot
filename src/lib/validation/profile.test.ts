import { describe, it, expect } from "vitest";
import {
  CURRENCIES,
  CURRENCY_CODES,
  TIMEZONES,
  profileSchema,
} from "@/lib/validation/profile";

const VALID = {
  name: "Phil",
  homeCity: "Charlotte, NC",
  currency: "USD",
  timezone: "America/New_York",
};

describe("profileSchema", () => {
  it("accepts a filled-in profile", () => {
    expect(profileSchema.safeParse(VALID).success).toBe(true);
  });

  it("requires a name", () => {
    expect(profileSchema.safeParse({ ...VALID, name: "  " }).success).toBe(false);
  });

  it("treats home city as optional", () => {
    const result = profileSchema.safeParse({ ...VALID, homeCity: "" });
    expect(result.success).toBe(true);
  });

  it("trims what it stores", () => {
    const result = profileSchema.safeParse({
      ...VALID,
      name: "  Phil  ",
      homeCity: "  Charlotte, NC  ",
    });
    expect(result.success && result.data.name).toBe("Phil");
    expect(result.success && result.data.homeCity).toBe("Charlotte, NC");
  });

  it("rejects a currency the app cannot format", () => {
    expect(profileSchema.safeParse({ ...VALID, currency: "XYZ" }).success).toBe(
      false,
    );
  });

  it("rejects a timezone that is not offered", () => {
    expect(
      profileSchema.safeParse({ ...VALID, timezone: "Mars/Olympus" }).success,
    ).toBe(false);
  });
});

describe("the currency list", () => {
  it("can actually be formatted by Intl", () => {
    // A currency in the picker that Intl cannot format would throw on every
    // page that shows a price.
    for (const currency of CURRENCIES) {
      expect(() =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency.code,
        }).format(1),
      ).not.toThrow();
    }
  });

  it("has a code for every entry", () => {
    expect(CURRENCY_CODES).toHaveLength(CURRENCIES.length);
  });
});

describe("the timezone list", () => {
  it("only offers zones the runtime knows", () => {
    for (const zone of TIMEZONES) {
      expect(() =>
        new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date()),
      ).not.toThrow();
    }
  });
});

describe("currency is per trip, not retroactive", () => {
  it("formats the same amount differently per currency", () => {
    // The reason a trip keeps its own currency: relabelling 300,000 cents
    // from USD to EUR does not convert it, it just misstates it.
    const usd = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(3_000);
    const eur = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
    }).format(3_000);

    expect(usd).not.toBe(eur);
    // Same number, different symbol — which is exactly why an existing
    // trip's currency must not be switched underneath it.
    expect(usd).toContain("3,000");
    expect(eur).toContain("3,000");
  });
});
