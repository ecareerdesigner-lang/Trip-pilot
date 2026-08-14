import { z } from "zod";

/**
 * Account settings.
 *
 * Currency and timezone are not decoration: currency formats every price in
 * the app, and home city seeds the wizard's starting location. Getting them
 * wrong once and never being able to change them is the kind of small trap
 * that makes software feel hostile.
 */

/** Currencies the app formats prices in. */
export const CURRENCIES = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "JPY", label: "Japanese Yen" },
] as const;

export const CURRENCY_CODES = CURRENCIES.map((entry) => entry.code);

/**
 * Timezones offered.
 *
 * A short list of the ones the sample destinations sit in, rather than the
 * full IANA database — a picker with six hundred entries is worse than one
 * with eight, and anything missing can be added when somebody needs it.
 */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

export const profileSchema = z.object({
  name: z
    .string({ message: "What should we call you?" })
    .trim()
    .min(1, { message: "What should we call you?" })
    .max(80, { message: "That name is too long." }),
  homeCity: z
    .string()
    .trim()
    .max(120, { message: "That is too long for a city." })
    .default(""),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]], {
    message: "Pick a currency.",
  }),
  timezone: z.enum(TIMEZONES as unknown as [string, ...string[]], {
    message: "Pick a timezone.",
  }),
});

export type ProfileValues = z.infer<typeof profileSchema>;
