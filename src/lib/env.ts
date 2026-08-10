import "server-only";
import { z } from "zod";

/**
 * Server-side environment configuration.
 *
 * Validation is LAZY on purpose: `next build` must succeed on a machine with
 * no secrets (CI, a fresh clone, a preview container). Nothing here is ever
 * imported by a client component — `server-only` enforces that at build time.
 */

const providerModeSchema = z
  .string()
  .trim()
  .min(1)
  .default("mock")
  .transform((value) => value.toLowerCase());

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().trim().optional(),
  AUTH_SECRET: z.string().trim().optional(),
  NEXT_PUBLIC_APP_URL: z.string().trim().default("http://localhost:3000"),

  ANTHROPIC_API_KEY: z.string().trim().optional(),

  MAPS_PROVIDER: providerModeSchema,
  MAPBOX_ACCESS_TOKEN: z.string().trim().optional(),
  GOOGLE_MAPS_API_KEY: z.string().trim().optional(),
  GOOGLE_PLACES_API_KEY: z.string().trim().optional(),

  FLIGHT_API_KEY: z.string().trim().optional(),
  HOTEL_API_KEY: z.string().trim().optional(),
  RESTAURANT_API_KEY: z.string().trim().optional(),
  ACTIVITY_API_KEY: z.string().trim().optional(),
  TRANSIT_API_KEY: z.string().trim().optional(),
  WEATHER_API_KEY: z.string().trim().optional(),

  FLIGHT_PROVIDER: providerModeSchema,
  HOTEL_PROVIDER: providerModeSchema,
  RESTAURANT_PROVIDER: providerModeSchema,
  ACTIVITY_PROVIDER: providerModeSchema,
  TRANSIT_PROVIDER: providerModeSchema,
  WEATHER_PROVIDER: providerModeSchema,

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(3600),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/** Parse and cache the environment. Throws only when a value is malformed. */
export function env(): ServerEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test hook. Clears the cached parse so a new process.env can be read. */
export function resetEnvCache(): void {
  cached = null;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(env().DATABASE_URL);
}

export function isAiConfigured(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}

/**
 * Which concrete implementation each provider interface should resolve to.
 * A provider stays on `mock` until both its mode and its credential are set,
 * so a half-configured provider can never silently pretend to be live.
 */
export function providerMode(
  kind:
    | "flights"
    | "hotels"
    | "restaurants"
    | "activities"
    | "maps"
    | "transit"
    | "weather",
): string {
  const e = env();

  switch (kind) {
    case "flights":
      return e.FLIGHT_API_KEY ? e.FLIGHT_PROVIDER : "mock";
    case "hotels":
      return e.HOTEL_API_KEY ? e.HOTEL_PROVIDER : "mock";
    case "restaurants":
      return e.RESTAURANT_API_KEY ? e.RESTAURANT_PROVIDER : "mock";
    case "activities":
      return e.ACTIVITY_API_KEY ? e.ACTIVITY_PROVIDER : "mock";
    case "transit":
      return e.TRANSIT_API_KEY ? e.TRANSIT_PROVIDER : "mock";
    case "weather":
      return e.WEATHER_API_KEY ? e.WEATHER_PROVIDER : "mock";
    case "maps": {
      if (e.MAPS_PROVIDER === "mapbox" && e.MAPBOX_ACCESS_TOKEN) return "mapbox";
      if (e.MAPS_PROVIDER === "google" && e.GOOGLE_MAPS_API_KEY) return "google";
      return "mock";
    }
    default:
      return "mock";
  }
}
