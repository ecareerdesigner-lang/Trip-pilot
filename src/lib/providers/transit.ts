import "server-only";
import { env, providerMode } from "@/lib/env";
import { AppError, providerUnavailable } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { streetDistanceMeters } from "@/lib/geo";
import { planRoute } from "@/lib/travel/routing";
import type {
  TransitProvider,
  TransitQuery,
  TransitRoute,
  TransitLeg,
} from "@/lib/providers/types";
import type { TransportMode } from "@/types/domain";

/**
 * Transit provider.
 *
 * A thin wrapper over the pure routing engine in `travel/routing.ts`. When a
 * live routing API is added it implements this same interface, and nothing
 * that calls `getTransitProvider()` changes.
 */

export class MockTransitProvider implements TransitProvider {
  async route(query: TransitQuery): Promise<TransitRoute> {
    return planRoute(query);
  }
}

/**
 * Google Routes API — computeRoutes.
 *
 * https://developers.google.com/maps/documentation/routes/compute_route_directions
 *
 * ⚠️ Built without a real response to check field names against. The
 * request shape and top-level response shape (routes[].legs[].steps[]) are
 * verified against Google's docs, but the exact nesting and enum values
 * inside `transitDetails` — specifically `transitLine.vehicle.type` — are
 * recalled, not confirmed against a live call. Test this against a real
 * TRANSIT-mode trip and compare the raw JSON before trusting the vehicle
 * type mapping below; an unrecognized type silently falls through to
 * "OTHER" rather than throwing, which is safe but means a wrong mapping
 * would not be obvious without looking.
 */

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK =
  "routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails";

type GoogleTravelMode = "WALK" | "DRIVE" | "TRANSIT";

interface GoogleStep {
  travelMode?: string;
  staticDuration?: string;
  distanceMeters?: number;
  navigationInstruction?: { instructions?: string };
  transitDetails?: {
    transitLine?: {
      name?: string;
      vehicle?: { type?: string; name?: { text?: string } };
    };
    stopDetails?: {
      arrivalStop?: { name?: string };
      departureStop?: { name?: string };
    };
  };
}

interface GoogleRoute {
  duration?: string;
  distanceMeters?: number;
  legs?: { steps?: GoogleStep[] }[];
}

interface ComputeRoutesResponse {
  routes?: GoogleRoute[];
}

function apiKey(): string {
  const key = (env().TRANSIT_API_KEY ?? "").trim();
  if (!key) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "TRANSIT_API_KEY is not set. Check .env.",
    );
  }
  return key;
}

/** "165s" -> 3 (minutes, rounded up so a 61-second leg is not "0 minutes"). */
function parseDurationMinutes(duration: string | undefined): number {
  if (!duration) return 0;
  const seconds = Number.parseInt(duration.replace(/s$/, ""), 10);
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(1, Math.ceil(seconds / 60));
}

/**
 * Google's transit vehicle types, mapped onto this app's TRANSPORT_MODES.
 * Recalled from documentation, not confirmed against a live response — see
 * the file-level warning above. SUBWAY, BUS, TRAIN, FERRY and OTHER are all
 * real TransportMode values, so an unmapped type falls through safely.
 */
function mapVehicleType(googleType: string | undefined): TransportMode {
  switch (googleType) {
    case "SUBWAY":
    case "METRO_RAIL":
    case "HEAVY_RAIL":
      return "SUBWAY";
    case "BUS":
    case "INTERCITY_BUS":
    case "TROLLEYBUS":
      return "BUS";
    case "RAIL":
    case "COMMUTER_TRAIN":
    case "HIGH_SPEED_TRAIN":
    case "LONG_DISTANCE_TRAIN":
    case "TRAM":
    case "MONORAIL":
      return "TRAIN";
    case "FERRY":
      return "FERRY";
    default:
      return "OTHER";
  }
}

function transitStepToLeg(
  step: GoogleStep,
  legOrder: number,
  from: string,
  to: string,
): TransitLeg {
  const mode = mapVehicleType(step.transitDetails?.transitLine?.vehicle?.type);
  const stopFrom = step.transitDetails?.stopDetails?.departureStop?.name;
  const stopTo = step.transitDetails?.stopDetails?.arrivalStop?.name;
  const lineName =
    step.transitDetails?.transitLine?.name ??
    step.transitDetails?.transitLine?.vehicle?.name?.text;

  return {
    providerName: "google",
    isMock: false,
    mode,
    legOrder,
    originLabel: legOrder === 0 ? from : "",
    destinationLabel: to,
    distanceMeters: step.distanceMeters ?? 0,
    durationMinutes: parseDurationMinutes(step.staticDuration),
    // Google's Routes API does not reliably return transit fare data in
    // this response shape. 0 rather than a guess — a wrong number here is
    // worse than an honest gap, and the budget engine already treats an
    // unpriced leg as "unknown", not "free".
    costCents: 0,
    instructions: `Take ${lineName ?? "transit"}${stopFrom ? ` from ${stopFrom}` : ""}${
      stopTo ? ` to ${stopTo}` : ""
    }.`,
  };
}

function walkStepsToLeg(
  steps: GoogleStep[],
  legOrder: number,
  from: string,
  to: string,
  mode: TransportMode,
): TransitLeg {
  // Google returns a single walking portion as many turn-by-turn navigation
  // steps ("turn left", "continue for 200ft"), not one leg — displaying
  // each of those as its own "Walk 1 min" produced a route with dozens of
  // fragments instead of the handful a traveler actually cares about.
  // Merged into one leg here, the way the mock always represented a walk.
  //
  // `mode` is the travelMode actually requested (WALK or DRIVE), not always
  // WALK — a DRIVE request's steps are turn-by-turn driving directions,
  // still not TRANSIT, and were previously landing here mislabeled as a
  // walk. A 15km "walk" covered in 20 minutes is what that bug looked like
  // on screen: correct distance and duration, wrong mode, so the validator
  // flagged an impossible walking speed for what was actually a real drive.
  const distanceMeters = steps.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0);
  const durationMinutes = steps.reduce(
    (sum, s) => sum + parseDurationMinutes(s.staticDuration),
    0,
  );

  return {
    providerName: "google",
    isMock: false,
    mode,
    legOrder,
    originLabel: legOrder === 0 ? from : "",
    destinationLabel: to,
    distanceMeters,
    durationMinutes: Math.max(1, durationMinutes),
    costCents: 0,
    instructions: mode === "WALK" ? `Walk to ${to}.` : `Drive to ${to}.`,
  };
}

/** Groups raw Google steps into displayed legs: consecutive non-transit
 * steps merge into one leg using the mode actually requested (WALK or
 * DRIVE), each TRANSIT step stays its own leg. */
function consolidateSteps(
  steps: GoogleStep[],
  from: string,
  to: string,
  nonTransitMode: TransportMode,
): TransitLeg[] {
  const legs: TransitLeg[] = [];
  let stepBuffer: GoogleStep[] = [];

  const flushBuffer = () => {
    if (stepBuffer.length === 0) return;
    legs.push(
      walkStepsToLeg(stepBuffer, legs.length, from, to, nonTransitMode),
    );
    stepBuffer = [];
  };

  for (const step of steps) {
    if (step.travelMode === "TRANSIT" && step.transitDetails) {
      flushBuffer();
      legs.push(transitStepToLeg(step, legs.length, from, to));
    } else {
      stepBuffer.push(step);
    }
  }
  flushBuffer();

  return legs;
}

/**
 * Which Google travel mode to request. Mirrors the same distance
 * thresholds `travel/routing.ts` uses for the mock, so switching a
 * destination between mock and live data does not also silently change
 * when the app decides to walk versus ride.
 */
function chooseTravelMode(
  meters: number,
  preferences: TransitQuery["preferences"],
): GoogleTravelMode {
  const walkPreferred = preferences.includes("WALKING_PREFERRED");
  const ridesharePreferred = preferences.includes("RIDESHARE_PREFERRED");
  const carPreferred = preferences.includes("RENTAL_CAR_PREFERRED");

  const walkLimit = walkPreferred ? 3_000 : 1_000;
  if (meters <= walkLimit) return "WALK";
  if (ridesharePreferred || carPreferred) return "DRIVE";
  return "TRANSIT";
}

async function computeRoute(
  query: TransitQuery,
  travelMode: GoogleTravelMode,
  timeoutMs = 10_000,
): Promise<GoogleRoute | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: query.origin.latitude,
              longitude: query.origin.longitude,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: query.destinationPoint.latitude,
              longitude: query.destinationPoint.longitude,
            },
          },
        },
        travelMode,
        ...(query.departAt ? { departureTime: query.departAt } : {}),
        languageCode: "en-US",
        units: "IMPERIAL",
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        detail = body.error?.message ?? "";
      } catch {
        detail = "";
      }
      logger.error("Google Routes request failed", {
        status: response.status,
        travelMode,
        detail,
      });
      throw providerUnavailable("Google Routes");
    }

    const data = (await response.json()) as ComputeRoutesResponse;
    return data.routes?.[0] ?? null;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw providerUnavailable("Google Routes");
    }
    logger.error("Google Routes request threw", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw providerUnavailable("Google Routes");
  } finally {
    clearTimeout(timeout);
  }
}

export class GoogleTransitProvider implements TransitProvider {
  async route(query: TransitQuery): Promise<TransitRoute> {
    const from = query.originLabel ?? "your location";
    const to = query.destinationLabel ?? "your destination";
    const meters = streetDistanceMeters(query.origin, query.destinationPoint);

    // Same as the mock: near enough that a route would be noise.
    if (meters < 120) {
      return {
        providerName: "google",
        isMock: false,
        legs: [
          {
            providerName: "google",
            isMock: false,
            mode: "WALK",
            legOrder: 0,
            originLabel: from,
            destinationLabel: to,
            distanceMeters: meters,
            durationMinutes: 1,
            costCents: 0,
            instructions: `Walk to ${to}.`,
          },
        ],
        totalDurationMinutes: 1,
        totalCostCents: 0,
        totalDistanceMeters: meters,
      };
    }

    const travelMode = chooseTravelMode(meters, query.preferences);
    const route = await computeRoute(query, travelMode);

    if (!route) {
      throw providerUnavailable("Google Routes");
    }

    const steps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];

    // Only a genuine DRIVE request's non-transit steps are actually
    // driving. A TRANSIT request's non-transit steps are the walk to and
    // from the stop — defaulting anything that wasn't literally "WALK" to
    // "CAR" mislabeled those connector walks as short drives, which is
    // exactly what "Drive 14 min ... Bus 6 min ... Drive 4 min" was: two
    // walks to a bus stop, both shown as driving.
    const nonTransitMode: TransportMode = travelMode === "DRIVE" ? "CAR" : "WALK";

    const legs: TransitLeg[] =
      steps.length > 0
        ? consolidateSteps(steps, from, to, nonTransitMode)
        : [
            // WALK and DRIVE requests do not always break into steps the
            // way TRANSIT does — a single-leg fallback using the route
            // total rather than an empty result.
            {
              providerName: "google",
              isMock: false,
              mode: nonTransitMode,
              legOrder: 0,
              originLabel: from,
              destinationLabel: to,
              distanceMeters: route.distanceMeters ?? meters,
              durationMinutes: parseDurationMinutes(route.duration),
              costCents: 0,
              instructions: `Travel to ${to}.`,
            },
          ];

    return {
      providerName: "google",
      isMock: false,
      legs,
      totalDurationMinutes: legs.reduce((sum, l) => sum + l.durationMinutes, 0),
      totalCostCents: legs.reduce((sum, l) => sum + l.costCents, 0),
      totalDistanceMeters: legs.reduce((sum, l) => sum + l.distanceMeters, 0),
    };
  }
}

export function getTransitProvider(): TransitProvider {
  switch (providerMode("transit")) {
    case "google":
      return new GoogleTransitProvider();
    default:
      return new MockTransitProvider();
  }
}
