import "server-only";
import { getPrisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { databaseUnavailable, notFound } from "@/lib/errors";
import { sampleDashboardData, sampleTrips } from "@/lib/sample-trips";
import {
  buildBudgetLedger,
  buildMustDoRows,
  buildPreferenceRow,
  buildTripDays,
  buildTripScalars,
} from "@/lib/travel/trip-setup";
import {
  categorizeTrips,
  toItineraryDay,
  toNextStops,
  toTripSummary,
} from "@/lib/repositories/mappers";
import { computeBudget, ledgerFromDays, type BudgetReport } from "@/lib/travel/budget";
import {
  validateItinerary,
  type ValidationReport,
} from "@/lib/travel/validate-itinerary";
import {
  buildTransportationReport,
  type TransportationReport,
} from "@/lib/travel/transportation";
import { REPLACED_ON_REBUILD } from "@/lib/travel/rebuild-policy";
import type { ChatCommand } from "@/lib/ai/chat-commands";
import {
  recomputeLegs,
  resolveOverlapsAfter,
  addItem,
  moveItem,
  removeItem,
  resizeItem,
  setCompleted,
  shiftFrom,
  type EditContext,
  type EditResult,
} from "@/lib/travel/edit-itinerary";
import type {
  NewItemPayload,
  UpdateItemPayload,
} from "@/lib/validation/itinerary-item";
import type { OptimizeResult } from "@/lib/travel/optimize-itinerary";
import type { BuiltPlan } from "@/lib/travel/plan-builder";
import type { TripPayload } from "@/lib/validation/trip";
import type { BudgetCategory } from "@/types/domain";
import type {
  DashboardData,
  ItineraryDay,
  TripItinerary,
  TripSummary,
  UpcomingItinerary,
} from "@/types/view";

/**
 * Trip data access.
 *
 * The one place that touches Prisma. Every read falls back to the labelled
 * sample dataset when no database is configured, so the app stays usable on
 * a fresh clone — and says on screen which one it is showing.
 *
 * Row shaping lives in `mappers.ts` and row building in `travel/trip-setup.ts`,
 * both pure and unit tested. What remains here is queries.
 */

/** Included on every fetch that produces a summary. */
const SUMMARY_INCLUDE = {
  budgets: { select: { plannedCents: true } },
  mustDos: { select: { status: true } },
  _count: { select: { itineraryItems: true } },
} as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listTrips(userId: string): Promise<{
  trips: TripSummary[];
  source: "database" | "sample";
}> {
  const prisma = getPrisma();
  if (!prisma) return { trips: sampleTrips(), source: "sample" };

  const rows = await prisma.trip.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    include: SUMMARY_INCLUDE,
  });

  return { trips: rows.map(toTripSummary), source: "database" };
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const prisma = getPrisma();
  if (!prisma) return sampleDashboardData();

  const rows = await prisma.trip.findMany({
    where: { userId },
    orderBy: { startDate: "asc" },
    include: SUMMARY_INCLUDE,
  });

  // A signed-in traveler with no trips gets an empty dashboard, not the
  // sample one. The sample trips carry ids like "sample-nyc", which are not
  // uuids — clicking one used to crash the trip page. An empty state that
  // invites you to plan a trip is the right answer here anyway.
  if (rows.length === 0) {
    return {
      upcoming: [],
      drafts: [],
      past: [],
      nextUp: null,
      totals: {
        tripsPlanned: 0,
        nightsPlanned: 0,
        destinations: 0,
        plannedSpendCents: 0,
        currency: "USD",
      },
      source: "database",
    };
  }

  const trips: TripSummary[] = rows.map(toTripSummary);
  const { upcoming, drafts, past } = categorizeTrips(trips, todayIso());

  const nights = trips.reduce((total, trip) => {
    const start = Date.parse(`${trip.startDate}T00:00:00Z`);
    const end = Date.parse(`${trip.endDate}T00:00:00Z`);
    return total + Math.round((end - start) / 86_400_000);
  }, 0);

  return {
    upcoming,
    drafts,
    past,
    nextUp: await getNextUp(userId, upcoming[0]),
    totals: {
      tripsPlanned: trips.length,
      nightsPlanned: nights,
      destinations: new Set(trips.map((trip) => trip.destination)).size,
      plannedSpendCents: trips.reduce((sum, trip) => sum + trip.plannedCents, 0),
      currency: trips[0]?.currency ?? "USD",
    },
    source: "database",
  };
}

/**
 * The opening stops of the soonest trip.
 *
 * Anchored to the trip's first scheduled day rather than to "now", so a trip
 * three weeks out previews its first day instead of showing nothing.
 */
async function getNextUp(
  userId: string,
  trip: TripSummary | undefined,
): Promise<UpcomingItinerary | null> {
  const prisma = getPrisma();
  if (!prisma || !trip) return null;

  const firstDay = await prisma.tripDay.findFirst({
    where: { tripId: trip.id, trip: { userId }, itineraryItems: { some: {} } },
    orderBy: { dayNumber: "asc" },
    include: {
      itineraryItems: {
        orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }],
        take: 8,
        include: {
          location: { select: { name: true } },
          inboundLegs: {
            orderBy: { legOrder: "asc" },
            select: {
              id: true,
              mode: true,
              departureTime: true,
              durationMinutes: true,
              instructions: true,
              legOrder: true,
            },
          },
        },
      },
    },
  });

  if (!firstDay) return null;

  return {
    tripId: trip.id,
    tripName: trip.name,
    destination: trip.destination,
    date: firstDay.date.toISOString().slice(0, 10),
    stops: toNextStops(firstDay.itineraryItems),
  };
}

export async function getTripSummary(
  userId: string,
  tripId: string,
): Promise<TripSummary | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return sampleTrips().find((trip) => trip.id === tripId) ?? null;
  }

  // Ids come from the URL. A malformed one cannot identify a trip, and
  // Postgres rejects a non-uuid at the type level — which reached the user as
  // a stack trace instead of the 404 it should be.
  if (!isUuid(tripId)) return null;

  const row = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    include: SUMMARY_INCLUDE,
  });

  return row ? toTripSummary(row) : null;
}

/**
 * Create a trip and everything that must exist alongside it.
 *
 * A trip with days but no budget ledger, or one whose must-dos failed to
 * write, is a broken trip. Prisma runs nested writes in a single implicit
 * transaction, so all of it lands or none of it does.
 */
export async function createTrip(
  userId: string,
  payload: TripPayload,
): Promise<{ id: string }> {
  const prisma = getPrisma();
  if (!prisma) throw databaseUnavailable();

  const days = buildTripDays(payload.startDate, payload.endDate);
  const mustDos = buildMustDoRows(payload);

  // Nested writes run in a single implicit transaction, so no explicit
  // $transaction is needed. Everything lands together or nothing does.
  const created = await prisma.trip.create({
    data: {
      userId,
      ...buildTripScalars(payload),
      status: "DRAFT",
      preference: { create: buildPreferenceRow(payload) },
      days: { createMany: { data: days } },
      budgets: { createMany: { data: buildBudgetLedger() } },
      ...(mustDos.length > 0
        ? { mustDos: { createMany: { data: mustDos } } }
        : {}),
    },
    select: { id: true },
  });

  return { id: created.id };
}

export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) throw databaseUnavailable();
  if (!isUuid(tripId)) throw notFound("That trip does not exist.");

  // Scoped to the owner, so a wrong id deletes nothing rather than someone
  // else's trip.
  const result = await prisma.trip.deleteMany({ where: { id: tripId, userId } });
  if (result.count === 0) throw notFound("That trip does not exist.");
}

/**
 * Ensure the local owner exists before the first trip is written.
 *
 * Phase 22 replaces this with real sign-up. Until then a trip needs a user
 * row to hang off, and the wizard should not fail on a fresh database.
 */
/**
 * Removed.
 *
 * This upserted a user row before creating a trip, from the era when there
 * was no sign-up. With real accounts, `requireUser()` only ever returns a
 * user that already exists — and a function that can create a row with no
 * password hash is a way in, not a convenience. Deleted rather than left
 * unused, because dead code that mints accounts eventually gets called.
 */

/**
 * Replace a trip's generated itinerary.
 *
 * Items the traveler added themselves are preserved; only generated ones are
 * cleared. Regenerating must not silently delete the dinner reservation
 * somebody typed in by hand.
 *
 * Nested creates keep each item and its inbound legs atomic.
 */
export async function saveGeneratedItinerary(
  userId: string,
  tripId: string,
  built: BuiltPlan,
): Promise<{ itemCount: number; legCount: number }> {
  const prisma = getPrisma();
  if (!prisma) throw databaseUnavailable();
  if (!isUuid(tripId)) throw notFound("That trip does not exist.");

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true },
  });
  if (!trip) throw notFound("That trip does not exist.");

  const days: { id: string; date: Date }[] = await prisma.tripDay.findMany({
    where: { tripId },
    select: { id: true, date: true },
  });
  const dayIdByDate = new Map(
    days.map((day) => [day.date.toISOString().slice(0, 10), day.id]),
  );

  // Clear everything this app generated. Only items the traveler added by
  // hand survive a rebuild.
  //
  // MUST_DO used to be excluded from this list, on the theory that must-dos
  // are precious. They are — but the *item* satisfying one is generated like
  // any other, so leaving it behind meant every regeneration stacked another
  // copy of the same museum on the same day.
  await prisma.itineraryItem.deleteMany({
    where: { tripId, source: { in: REPLACED_ON_REBUILD } },
  });

  // Placed must-dos point at items that no longer exist. Reset them before
  // re-linking, or a stale itineraryItemId survives the rebuild.
  await prisma.mustDo.updateMany({
    where: { tripId, status: { not: "COMPLETED" } },
    data: { status: "UNSCHEDULED", itineraryItemId: null },
  });

  const mustDos: { id: string; title: string }[] = await prisma.mustDo.findMany({
    where: { tripId },
    select: { id: true, title: true },
  });
  const mustDoIdByTitle = new Map(
    mustDos.map((mustDo) => [mustDo.title, mustDo.id]),
  );

  let itemCount = 0;
  let legCount = 0;

  for (const item of built.items) {
    const tripDayId = dayIdByDate.get(item.date);
    if (!tripDayId) continue;

    // Locations are reused rather than recreated. The comment here used to
    // claim an upsert while the code created a new row every time, so each
    // regeneration left another orphaned copy of every place behind —
    // unbounded growth driven by a button anyone can press repeatedly.
    let locationId: string | null = null;
    if (item.place) {
      const existing = item.place.providerRef
        ? await prisma.location.findFirst({
            where: {
              providerName: item.place.providerName ?? null,
              providerRef: item.place.providerRef,
            },
            select: { id: true },
          })
        : await prisma.location.findFirst({
            where: {
              name: item.place.name,
              latitude: item.place.latitude ?? null,
              longitude: item.place.longitude ?? null,
            },
            select: { id: true },
          });

      if (existing) {
        locationId = existing.id;
      } else {
      const location = await prisma.location.create({
        data: {
          name: item.place.name,
          kind: item.place.kind ?? "OTHER",
          address: item.place.address ?? null,
          city: item.place.city ?? null,
          region: item.place.region ?? null,
          country: item.place.country ?? null,
          latitude: item.place.latitude ?? null,
          longitude: item.place.longitude ?? null,
          timezone: item.place.timezone ?? null,
          providerName: item.place.providerName ?? null,
          providerRef: item.place.providerRef ?? null,
          isMock: item.place.isMock ?? true,
        },
        select: { id: true },
      });
      locationId = location.id;
      }
    }

    const created = await prisma.itineraryItem.create({
      data: {
        tripId,
        tripDayId,
        locationId,
        type: item.type,
        title: item.title,
        description: item.description || null,
        startTime: item.startTime,
        endTime: item.endTime,
        durationMinutes: item.durationMinutes,
        estimatedCostCents: item.estimatedCostCents,
        budgetCategory: item.budgetCategory,
        reservationRequired: item.reservationRequired,
        reservationStatus: item.reservationStatus,
        priority: item.priority,
        source: item.satisfiesMustDo ? "MUST_DO" : "AI_SUGGESTION",
        sortOrder: item.sortOrder,
        isMock: item.isMock,
      },
      select: { id: true },
    });
    itemCount += 1;

    for (const leg of item.legs) {
      await prisma.transportationLeg.create({
        data: {
          tripId,
          toItemId: created.id,
          originLabel: leg.originLabel,
          destinationLabel: leg.destinationLabel,
          mode: leg.mode,
          departureTime: leg.departureTime,
          arrivalTime: leg.arrivalTime,
          durationMinutes: leg.durationMinutes,
          estimatedCostCents: leg.costCents,
          distanceMeters: leg.distanceMeters,
          instructions: leg.instructions,
          provider: leg.providerName,
          legOrder: leg.legOrder,
          isMock: leg.isMock,
        },
      });
      legCount += 1;
    }

    if (item.satisfiesMustDo) {
      const mustDoId = mustDoIdByTitle.get(item.satisfiesMustDo);
      if (mustDoId) {
        await prisma.mustDo.update({
          where: { id: mustDoId },
          data: { status: "SCHEDULED", itineraryItemId: created.id },
        });
      }
    }
  }

  // Recompute the planned ledger from what actually landed on the schedule.
  const planned = new Map<string, number>();
  for (const item of built.items) {
    planned.set(
      item.budgetCategory,
      (planned.get(item.budgetCategory) ?? 0) + item.estimatedCostCents,
    );
    const fares = item.legs.reduce((sum, leg) => sum + leg.costCents, 0);
    planned.set(
      "LOCAL_TRANSPORTATION",
      (planned.get("LOCAL_TRANSPORTATION") ?? 0) + fares,
    );
  }

  for (const [category, plannedCents] of planned) {
    await prisma.budget.updateMany({
      where: { tripId, category: category as BudgetCategory },
      data: { plannedCents },
    });
  }

  await prisma.trip.update({
    where: { id: tripId },
    data: { status: "READY", generatedAt: new Date() },
  });

  return { itemCount, legCount };
}

/**
 * A trip's full schedule, day by day, with every journey between stops.
 *
 * Legs are fetched with their items rather than separately, because the
 * timeline renders them interleaved and a second round trip per item would
 * make a four-day trip issue thirty queries.
 */
export async function getItinerary(
  userId: string,
  tripId: string,
): Promise<TripItinerary | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  if (!isUuid(tripId)) return null;

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true, name: true, destination: true, currency: true },
  });
  if (!trip) return null;

  const days = await prisma.tripDay.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    include: {
      itineraryItems: {
        orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }],
        include: {
          location: {
            select: { name: true, latitude: true, longitude: true },
          },
          inboundLegs: {
            orderBy: { legOrder: "asc" },
            include: {
              originLocation: { select: { name: true } },
              destinationLocation: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const mapped: ItineraryDay[] = days.map(toItineraryDay);

  return {
    tripId: trip.id,
    tripName: trip.name,
    destination: trip.destination,
    currency: trip.currency,
    days: mapped,
    hasAnyItems: mapped.some((day) => day.items.length > 0),
    containsMockData: mapped.some((day) =>
      day.items.some((item) => item.isMock),
    ),
  };
}

/**
 * The budget report for a trip.
 *
 * Planned spend is recomputed from the schedule on every read rather than
 * trusted from the ledger, so an item that moved or a leg that changed mode
 * is reflected without anyone remembering to update a second number.
 */
export async function getTripBudget(
  userId: string,
  tripId: string,
): Promise<BudgetReport | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  if (!isUuid(tripId)) return null;

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: {
      totalBudgetCents: true,
      transportationBudgetCents: true,
      lodgingBudgetCents: true,
      foodBudgetCents: true,
      activityBudgetCents: true,
      localTransportationBudgetCents: true,
      budgets: { select: { category: true, plannedCents: true, actualCents: true } },
    },
  });
  if (!trip) return null;

  const itinerary = await getItinerary(userId, tripId);
  const derived = itinerary ? ledgerFromDays(itinerary.days) : [];

  // Actual spend is recorded, not derived, so it is carried over from the
  // stored ledger while planned is recomputed.
  const actualByCategory = new Map<BudgetCategory, number>(
    trip.budgets.map(
      (row: { category: BudgetCategory; actualCents: number }) =>
        [row.category, row.actualCents] as const,
    ),
  );

  const ledger = derived.map((row) => ({
    ...row,
    actualCents: actualByCategory.get(row.category) ?? 0,
  }));

  return computeBudget(
    {
      totalBudgetCents: trip.totalBudgetCents,
      transportationBudgetCents: trip.transportationBudgetCents,
      lodgingBudgetCents: trip.lodgingBudgetCents,
      foodBudgetCents: trip.foodBudgetCents,
      activityBudgetCents: trip.activityBudgetCents,
      localTransportationBudgetCents: trip.localTransportationBudgetCents,
    },
    ledger,
  );
}

/** Journeys grouped by day, with the mode breakdown for the whole trip. */
export async function getTripTransportation(
  userId: string,
  tripId: string,
): Promise<TransportationReport | null> {
  const itinerary = await getItinerary(userId, tripId);
  if (!itinerary) return null;
  return buildTransportationReport(itinerary.days);
}

/**
 * Run the reality-check engine against a stored trip.
 *
 * Budget warnings are folded in so one report covers everything wrong with
 * the trip rather than making the traveler check two screens.
 */
export async function validateTrip(
  userId: string,
  tripId: string,
): Promise<ValidationReport | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  if (!isUuid(tripId)) return null;

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: {
      preference: true,
      // Must-dos are requirements, so one that never got placed is a finding
      // the validation report has to carry.
      mustDos: {
        where: { status: "UNSCHEDULED" },
        select: { title: true },
      },
    },
  });
  if (!trip) return null;

  const itinerary = await getItinerary(userId, tripId);
  if (!itinerary) return null;

  const budget = await getTripBudget(userId, tripId);

  return validateItinerary(itinerary.days, {
    pace: trip.preference?.pace ?? "BALANCED",
    ...(trip.preference
      ? {
          dayStartMinute: trip.preference.dayStartMinute,
          dayEndMinute: trip.preference.dayEndMinute,
        }
      : {}),
    unscheduledMustDos: trip.mustDos.map(
      (mustDo: { title: string }) => mustDo.title,
    ),
    budgetWarnings: budget?.warnings ?? [],
  });
}

/**
 * Write an optimization back to the schedule.
 *
 * Only times move. Nothing is created or deleted, so a traveler who dislikes
 * the result loses arrangement, never content. Transportation legs are
 * re-timed to land exactly when the item they serve begins.
 */
export async function applyOptimization(
  userId: string,
  tripId: string,
  result: OptimizeResult,
): Promise<{ movedCount: number }> {
  const prisma = getPrisma();
  if (!prisma) throw databaseUnavailable();
  if (!isUuid(tripId)) throw notFound("That trip does not exist.");

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true },
  });
  if (!trip) throw notFound("That trip does not exist.");

  let movedCount = 0;

  for (const day of result.days) {
    const dayStart = Date.parse(`${day.date}T00:00:00.000Z`);

    for (const entry of day.items) {
      const startTime = new Date(dayStart + entry.startMinute * 60_000);
      const endTime = new Date(
        startTime.getTime() + entry.durationMinutes * 60_000,
      );

      await prisma.itineraryItem.updateMany({
        where: { id: entry.id, tripId },
        data: { startTime, endTime },
      });

      const legs: { id: string; durationMinutes: number; legOrder: number }[] =
        await prisma.transportationLeg.findMany({
          where: { toItemId: entry.id },
          orderBy: { legOrder: "asc" },
          select: { id: true, durationMinutes: true, legOrder: true },
        });

      // Lay the legs backwards from the item so the last one arrives exactly
      // as it starts, the same rule the plan builder uses.
      const total = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
      let cursor = startTime.getTime() - total * 60_000;

      for (const leg of legs) {
        const departureTime = new Date(cursor);
        cursor += leg.durationMinutes * 60_000;
        await prisma.transportationLeg.update({
          where: { id: leg.id },
          data: { departureTime, arrivalTime: new Date(cursor) },
        });
      }

      movedCount += 1;
    }
  }

  return { movedCount };
}

/**
 * Load one day, apply a pure edit, write the result back.
 *
 * The wrapper is deliberately thin. Every decision — what moves, what gets
 * rerouted, what a journey costs — lives in `travel/edit-itinerary.ts`, where
 * it is unit tested. This function only reads, delegates, and persists.
 */
async function editDay(
  userId: string,
  tripId: string,
  tripDayId: string,
  apply: (day: ItineraryDay, context: EditContext) => EditResult,
): Promise<ItineraryDay> {
  const prisma = getPrisma();
  if (!prisma) throw databaseUnavailable();

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    include: { preference: true },
  });
  if (!trip) throw notFound("That trip does not exist.");

  const row = await prisma.tripDay.findFirst({
    where: { id: tripDayId, tripId },
    include: {
      itineraryItems: {
        orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }],
        include: {
          location: { select: { name: true, latitude: true, longitude: true } },
          inboundLegs: {
            orderBy: { legOrder: "asc" },
            include: {
              originLocation: { select: { name: true } },
              destinationLocation: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!row) throw notFound("That day does not exist.");

  const before = toItineraryDay(row);
  const { day: after } = apply(before, {
    destination: trip.destination,
    travelers: trip.travelers,
    preferences: trip.preference?.transportPreferences ?? [],
  });

  const survivingIds = new Set(after.items.map((item) => item.id));

  // Anything the edit dropped goes, along with its journeys.
  await prisma.itineraryItem.deleteMany({
    where: { tripDayId, id: { notIn: [...survivingIds] } },
  });

  for (const [index, item] of after.items.entries()) {
    const existing = before.items.find((entry) => entry.id === item.id);

    if (existing) {
      await prisma.itineraryItem.update({
        where: { id: item.id },
        data: {
          title: item.title,
          description: item.description,
          startTime: new Date(item.startTime),
          endTime: new Date(item.endTime),
          durationMinutes: item.durationMinutes,
          completed: item.completed,
          sortOrder: index,
        },
      });
    } else {
      // New, and therefore the traveler's own. `USER` is what keeps it from
      // being cleared the next time the trip is regenerated.
      await prisma.itineraryItem.create({
        data: {
          id: item.id,
          tripId,
          tripDayId,
          type: item.type,
          title: item.title,
          description: item.description,
          startTime: new Date(item.startTime),
          endTime: new Date(item.endTime),
          durationMinutes: item.durationMinutes,
          estimatedCostCents: item.estimatedCostCents,
          budgetCategory: budgetCategoryFor(item.type),
          reservationRequired: item.reservationRequired,
          reservationStatus: item.reservationStatus,
          priority: item.priority,
          source: "USER",
          sortOrder: index,
          isMock: false,
        },
      });
    }

    // Legs are replaced wholesale: they are derived from the schedule, and
    // reconciling them one by one would be more code and more ways to drift.
    await prisma.transportationLeg.deleteMany({ where: { toItemId: item.id } });

    for (const leg of item.legs) {
      await prisma.transportationLeg.create({
        data: {
          tripId,
          toItemId: item.id,
          originLabel: leg.originLabel,
          destinationLabel: leg.destinationLabel,
          mode: leg.mode,
          departureTime: leg.departureTime ? new Date(leg.departureTime) : null,
          arrivalTime: leg.arrivalTime ? new Date(leg.arrivalTime) : null,
          durationMinutes: leg.durationMinutes,
          estimatedCostCents: leg.costCents,
          distanceMeters: leg.distanceMeters,
          instructions: leg.instructions,
          legOrder: leg.legOrder,
          isMock: false,
        },
      });
    }
  }

  return after;
}

function budgetCategoryFor(type: ItineraryDay["items"][number]["type"]) {
  switch (type) {
    case "TRAVEL":
      return "TRANSPORTATION" as const;
    case "LODGING":
      return "LODGING" as const;
    case "RESTAURANT":
      return "FOOD" as const;
    case "ACTIVITY":
    case "EXCURSION":
    case "SIGHTSEEING":
      return "ACTIVITIES" as const;
    case "TRANSPORTATION":
    case "WALKING":
      return "LOCAL_TRANSPORTATION" as const;
    default:
      return "MISCELLANEOUS" as const;
  }
}

export async function addItineraryItem(
  userId: string,
  tripId: string,
  payload: NewItemPayload,
): Promise<ItineraryDay> {
  const id = globalThis.crypto.randomUUID();
  return editDay(userId, tripId, payload.tripDayId, (day, context) =>
    addItem(
      day,
      {
        type: payload.type,
        title: payload.title,
        description: payload.description,
        startMinute: payload.startMinute,
        durationMinutes: payload.durationMinutes,
        ...(payload.locationName ? { locationName: payload.locationName } : {}),
        latitude: payload.latitude,
        longitude: payload.longitude,
        estimatedCostCents: payload.estimatedCostCents,
        reservationRequired: payload.reservationRequired,
      },
      context,
      id,
    ),
  );
}

/**
 * Move an item to a different day.
 *
 * Two edits, not one: the item leaves the day it was on and joins another,
 * and both days have to recalculate. Journeys are derived from what sits
 * either side of a stop, so removing something changes the day it left as
 * much as adding it changes the day it arrived on.
 *
 * Done as a transaction. An item that vanished from one day without landing
 * on the other is worse than a move that did not happen.
 */
export async function moveItemToDay(
  userId: string,
  tripId: string,
  itemId: string,
  toDate: string,
  toStartMinute: number | null,
): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) throw databaseUnavailable();
  if (!isUuid(tripId)) throw notFound("That trip does not exist.");

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    include: { preference: true },
  });
  if (!trip) throw notFound("That trip does not exist.");

  const item = await prisma.itineraryItem.findFirst({
    where: { id: itemId, tripId },
    select: {
      id: true,
      tripDayId: true,
      startTime: true,
      durationMinutes: true,
    },
  });
  if (!item) throw notFound("That item is not on the schedule.");

  const target = await prisma.tripDay.findFirst({
    where: { tripId, date: new Date(`${toDate}T00:00:00.000Z`) },
    select: { id: true, date: true },
  });
  if (!target) throw notFound("That day is not part of this trip.");

  // Already there: a plain re-time, which the day editor handles.
  if (target.id === item.tripDayId) {
    if (toStartMinute !== null) {
      await updateItineraryItem(userId, tripId, item.tripDayId, itemId, {
        startMinute: toStartMinute,
      });
    }
    return;
  }

  const startMinute =
    toStartMinute ??
    item.startTime.getUTCHours() * 60 + item.startTime.getUTCMinutes();

  const startTime = new Date(
    target.date.getTime() + startMinute * 60_000,
  );
  const endTime = new Date(
    startTime.getTime() + item.durationMinutes * 60_000,
  );

  const fromDayId = item.tripDayId;

  await prisma.$transaction([
    // The legs into this item described a journey from wherever it used to
    // follow. That context is gone, so they are cleared and rebuilt by the
    // recalculation below.
    prisma.transportationLeg.deleteMany({ where: { toItemId: itemId } }),
    prisma.itineraryItem.update({
      where: { id: itemId },
      data: { tripDayId: target.id, startTime, endTime },
    }),
  ]);

  // The day it left only needs its journeys rebuilt — a gap is not a
  // problem. The day it joined may now have two things in the same slot,
  // which is.
  await recomputeDayLegs(userId, tripId, fromDayId);
  await editDay(userId, tripId, target.id, (day, context) =>
    resolveOverlapsAfter(day, itemId, context),
  );
}

/**
 * Rebuild the journeys on a day from its current schedule.
 *
 * Expressed as an edit that changes nothing, so the same code path that
 * recalculates after any other change recalculates here.
 */
async function recomputeDayLegs(
  userId: string,
  tripId: string,
  tripDayId: string,
): Promise<void> {
  await editDay(userId, tripId, tripDayId, (day, context) =>
    recomputeLegs(day, context),
  );
}

export async function updateItineraryItem(
  userId: string,
  tripId: string,
  tripDayId: string,
  itemId: string,
  payload: UpdateItemPayload,
): Promise<ItineraryDay> {
  return editDay(userId, tripId, tripDayId, (day, context) => {
    let result: EditResult = { day, recomputedItemIds: [] };

    if (payload.completed !== undefined) {
      result = setCompleted(result.day, itemId, payload.completed);
    }
    if (payload.durationMinutes !== undefined) {
      result = resizeItem(result.day, itemId, payload.durationMinutes, context);
    }
    if (payload.startMinute !== undefined) {
      result = moveItem(result.day, itemId, payload.startMinute, context);
    }
    if (payload.shiftFollowingBy !== undefined) {
      result = shiftFrom(result.day, itemId, payload.shiftFollowingBy, context);
    }

    if (payload.title !== undefined || payload.description !== undefined) {
      const items = result.day.items.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              title: payload.title ?? entry.title,
              description: payload.description ?? entry.description,
            }
          : entry,
      );
      result = { day: { ...result.day, items }, recomputedItemIds: [] };
    }

    return result;
  });
}

export async function removeItineraryItem(
  userId: string,
  tripId: string,
  tripDayId: string,
  itemId: string,
): Promise<ItineraryDay> {
  return editDay(userId, tripId, tripDayId, (day, context) =>
    removeItem(day, itemId, context),
  );
}

/**
 * Candidate options stored for a trip, for the assistant to choose from.
 *
 * The assistant may only add places the providers actually returned. Without
 * this it would invent restaurants, which is the failure mode the whole
 * candidate architecture exists to prevent.
 */
export async function listTripOptions(
  userId: string,
  tripId: string,
): Promise<{ id: string; name: string; kind: string; costCents: number }[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  if (!isUuid(tripId)) return [];

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true },
  });
  if (!trip) return [];

  const [restaurants, activities] = await Promise.all([
    prisma.restaurantOption.findMany({
      where: { tripId },
      select: { id: true, name: true, averageMealCents: true },
      take: 20,
    }),
    prisma.activityOption.findMany({
      where: { tripId },
      select: { id: true, name: true, priceCents: true, category: true },
      take: 20,
    }),
  ]);

  return [
    ...restaurants.map(
      (row: { id: string; name: string; averageMealCents: number | null }) => ({
        id: row.id,
        name: row.name,
        kind: "restaurant",
        costCents: row.averageMealCents ?? 0,
      }),
    ),
    ...activities.map(
      (row: {
        id: string;
        name: string;
        priceCents: number | null;
        category: string | null;
      }) => ({
        id: row.id,
        name: row.name,
        kind: row.category ?? "activity",
        costCents: row.priceCents ?? 0,
      }),
    ),
  ];
}

/**
 * Apply commands the traveler approved.
 *
 * Routed through the same per-item helpers the UI controls use, so a change
 * made by chat recalculates transportation and conflicts exactly as one made
 * by hand does. Nothing here writes rows directly.
 */
export async function applyChatCommands(
  userId: string,
  tripId: string,
  commands: ChatCommand[],
): Promise<{ appliedCount: number; failed: string[] }> {
  const prisma = getPrisma();
  if (!prisma) throw databaseUnavailable();
  if (!isUuid(tripId)) throw notFound("That trip does not exist.");

  const dayRows: { id: string; date: Date }[] = await prisma.tripDay.findMany({
    where: { tripId, trip: { userId } },
    select: { id: true, date: true },
  });
  if (dayRows.length === 0) throw notFound("That trip does not exist.");

  const dayIdByDate = new Map(
    dayRows.map((row) => [row.date.toISOString().slice(0, 10), row.id]),
  );

  const itemRows: { id: string; tripDayId: string }[] =
    await prisma.itineraryItem.findMany({
      where: { tripId },
      select: { id: true, tripDayId: true },
    });
  const dayIdByItem = new Map(itemRows.map((row) => [row.id, row.tripDayId]));

  let appliedCount = 0;
  const failed: string[] = [];

  for (const command of commands) {
    try {
      if (command.kind === "add") {
        const tripDayId = dayIdByDate.get(command.date);
        if (!tripDayId) {
          failed.push(`${command.title} could not be added.`);
          continue;
        }
        await addItineraryItem(userId, tripId, {
          tripDayId,
          type: command.type,
          title: command.title,
          description: command.description,
          startMinute: command.startMinute,
          durationMinutes: command.durationMinutes,
          estimatedCostCents: command.estimatedCostCents,
          reservationRequired: false,
          latitude: null,
          longitude: null,
        });
        appliedCount += 1;
        continue;
      }

      const tripDayId = dayIdByItem.get(command.itemId);
      if (!tripDayId) {
        failed.push("An item could not be found.");
        continue;
      }

      if (command.kind === "remove") {
        await removeItineraryItem(userId, tripId, tripDayId, command.itemId);
      } else if (command.kind === "resize") {
        await updateItineraryItem(userId, tripId, tripDayId, command.itemId, {
          durationMinutes: command.durationMinutes,
        });
      } else {
        // Handles both a re-time within a day and a move to another one.
        await moveItemToDay(
          userId,
          tripId,
          command.itemId,
          command.toDate,
          command.toStartMinute,
        );
      }

      appliedCount += 1;
    } catch (error) {
      logger.warn("A chat command could not be applied", {
        kind: command.kind,
        message: error instanceof Error ? error.message : String(error),
      });
      failed.push("One change could not be applied.");
    }
  }

  return { appliedCount, failed };
}
