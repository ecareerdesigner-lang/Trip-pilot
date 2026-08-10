import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  SEED_LOCATIONS,
  SEED_MUST_DOS,
  SEED_TRIP,
  buildSeedTrip,
  type SeedLocationKey,
} from "./seed-data";

/**
 * Seed script — writes the sample trip to the database.
 *
 * All scheduling logic lives in `seed-data.ts`, which is pure and unit
 * tested. This file only writes what that produces, so a bug here is a
 * mapping bug rather than a scheduling bug.
 *
 * Idempotent: re-running deletes the previously seeded trip and rebuilds it.
 * Only the trip named in `SEED_TRIP` is touched; real trips are left alone.
 *
 * Everything written carries `isMock: true`. This is sample data and the UI
 * must be able to say so.
 *
 *   npm run db:seed
 */

const prisma = new PrismaClient();

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_EMAIL = "owner@localhost";

async function main(): Promise<void> {
  const built = buildSeedTrip();

  const user = await prisma.user.upsert({
    where: { id: OWNER_ID },
    update: {},
    create: {
      id: OWNER_ID,
      email: OWNER_EMAIL,
      name: "Traveler",
      homeCity: "Charlotte, NC",
      currency: "USD",
      timezone: "America/New_York",
    },
  });

  // Idempotency: clear any previous run. Cascades handle the children.
  const removed = await prisma.trip.deleteMany({
    where: { userId: user.id, name: SEED_TRIP.name },
  });
  if (removed.count > 0) {
    console.warn(`Removed ${removed.count} previously seeded trip(s).`);
  }

  const trip = await prisma.trip.create({
    data: {
      userId: user.id,
      name: SEED_TRIP.name,
      origin: SEED_TRIP.origin,
      destination: SEED_TRIP.destination,
      startDate: built.startDate,
      endDate: built.endDate,
      travelers: SEED_TRIP.travelers,
      status: "READY",
      currency: SEED_TRIP.currency,
      totalBudgetCents: SEED_TRIP.totalBudgetCents,
      transportationBudgetCents: SEED_TRIP.transportationBudgetCents,
      lodgingBudgetCents: SEED_TRIP.lodgingBudgetCents,
      foodBudgetCents: SEED_TRIP.foodBudgetCents,
      activityBudgetCents: SEED_TRIP.activityBudgetCents,
      localTransportationBudgetCents: SEED_TRIP.localTransportationBudgetCents,
      notes: SEED_TRIP.notes,
      travelMethod: SEED_TRIP.travelMethod,
      transportationIntent: SEED_TRIP.transportationIntent,
      generatedAt: new Date(),
      preference: {
        create: {
          pace: SEED_TRIP.preference.pace,
          foodPreference: SEED_TRIP.preference.foodPreference,
          transportPreferences: [...SEED_TRIP.preference.transportPreferences],
          interests: [...SEED_TRIP.preference.interests],
          dietaryRestrictions: [],
          dayStartMinute: SEED_TRIP.preference.dayStartMinute,
          dayEndMinute: SEED_TRIP.preference.dayEndMinute,
        },
      },
    },
  });

  // --- Locations ---------------------------------------------------------
  const locationIds = new Map<SeedLocationKey, string>();
  for (const [key, place] of Object.entries(SEED_LOCATIONS)) {
    const created = await prisma.location.create({
      data: {
        name: place.name,
        kind: place.kind,
        address: "address" in place ? place.address : null,
        city: place.city,
        region: "region" in place ? place.region : null,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: "America/New_York",
        providerName: "seed",
        isMock: true,
      },
    });
    locationIds.set(key as SeedLocationKey, created.id);
  }

  // --- Days --------------------------------------------------------------
  const dayIds = new Map<number, string>();
  for (const day of built.days) {
    const created = await prisma.tripDay.create({
      data: {
        tripId: trip.id,
        date: day.date,
        dayNumber: day.dayNumber,
      },
    });
    dayIds.set(day.dayNumber, created.id);
  }

  // --- Items and their inbound legs --------------------------------------
  const satisfyingKeys = new Set(
    SEED_MUST_DOS.map((mustDo) => mustDo.satisfiedBy).filter(
      (key): key is string => key !== null,
    ),
  );

  const itemIds = new Map<string, string>();
  for (const item of built.items) {
    const tripDayId = dayIds.get(item.day);
    if (!tripDayId) throw new Error(`No day row for day ${item.day}`);

    const created = await prisma.itineraryItem.create({
      data: {
        tripId: trip.id,
        tripDayId,
        locationId: locationIds.get(item.location) ?? null,
        type: item.type,
        title: item.title,
        description: item.description || null,
        startTime: item.startTime,
        endTime: item.endTime,
        durationMinutes: item.durationMinutes,
        estimatedCostCents: item.costCents,
        budgetCategory: item.budgetCategory,
        reservationRequired: item.reservationRequired,
        reservationStatus: item.reservationStatus,
        priority: item.priority,
        source: satisfyingKeys.has(item.key) ? "MUST_DO" : "SYSTEM",
        sortOrder: item.sortOrder,
        isMock: true,
      },
    });
    itemIds.set(item.key, created.id);

    for (const leg of item.legs) {
      await prisma.transportationLeg.create({
        data: {
          tripId: trip.id,
          toItemId: created.id,
          originLocationId: locationIds.get(leg.from) ?? null,
          destinationLocationId: locationIds.get(leg.to) ?? null,
          mode: leg.mode,
          departureTime: leg.departureTime,
          arrivalTime: leg.arrivalTime,
          durationMinutes: leg.durationMinutes,
          estimatedCostCents: leg.costCents,
          distanceMeters: leg.distanceMeters,
          instructions: leg.instructions,
          provider: "seed",
          legOrder: leg.legOrder,
          isMock: true,
        },
      });
    }
  }

  // --- Must-dos ----------------------------------------------------------
  for (const mustDo of SEED_MUST_DOS) {
    const linkedId = mustDo.satisfiedBy
      ? (itemIds.get(mustDo.satisfiedBy) ?? null)
      : null;

    await prisma.mustDo.create({
      data: {
        tripId: trip.id,
        title: mustDo.title,
        description: mustDo.description || null,
        status: linkedId ? "SCHEDULED" : "UNSCHEDULED",
        priority: "REQUIRED",
        itineraryItemId: linkedId,
      },
    });
  }

  // --- Budget ledger -----------------------------------------------------
  for (const [category, plannedCents] of Object.entries(
    built.plannedByCategory,
  )) {
    await prisma.budget.create({
      data: {
        tripId: trip.id,
        category: category as
          | "TRANSPORTATION"
          | "LODGING"
          | "FOOD"
          | "ACTIVITIES"
          | "LOCAL_TRANSPORTATION"
          | "MISCELLANEOUS",
        plannedCents,
        actualCents: 0,
      },
    });
  }

  const legCount = built.items.reduce(
    (total, item) => total + item.legs.length,
    0,
  );

  console.warn(
    [
      "",
      `Seeded "${SEED_TRIP.name}" (${trip.id})`,
      `  ${built.days.length} days, ${built.items.length} items, ${legCount} legs`,
      `  ${Object.keys(SEED_LOCATIONS).length} locations, ${SEED_MUST_DOS.length} must-dos`,
      `  planned ${(built.plannedTotalCents / 100).toFixed(2)} of ${(
        SEED_TRIP.totalBudgetCents / 100
      ).toFixed(2)} budget`,
      "  all rows marked isMock: true",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
