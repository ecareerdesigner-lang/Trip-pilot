import { TRANSPORT_MODE_LABEL } from "@/lib/constants";
import type {
  ItemSource,
  ItineraryItemType,
  MustDoStatus,
  Priority,
  ReservationStatus,
  TransportMode,
  TripStatus,
} from "@/types/domain";
import type {
  ItineraryDay,
  NextStop,
  TimelineItem,
  TimelineLeg,
  TripSummary,
} from "@/types/view";

/**
 * Database rows to view models.
 *
 * Structural input types rather than Prisma's generated ones, so this is
 * testable without a client and without a database. Prisma's rows satisfy
 * these shapes; nothing here depends on how they were fetched.
 */

export interface TripRowForSummary {
  id: string;
  name: string;
  origin: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  travelers: number;
  status: TripStatus;
  currency: string;
  totalBudgetCents: number | null;
  budgets: { plannedCents: number }[];
  mustDos: { status: MustDoStatus }[];
  _count: { itineraryItems: number };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toTripSummary(row: TripRowForSummary): TripSummary {
  return {
    id: row.id,
    name: row.name,
    origin: row.origin,
    destination: row.destination,
    startDate: isoDate(row.startDate),
    endDate: isoDate(row.endDate),
    travelers: row.travelers,
    status: row.status,
    currency: row.currency,
    totalBudgetCents: row.totalBudgetCents,
    plannedCents: row.budgets.reduce((sum, budget) => sum + budget.plannedCents, 0),
    itemCount: row._count.itineraryItems,
    mustDoCount: row.mustDos.length,
    mustDoScheduledCount: row.mustDos.filter(
      (mustDo) => mustDo.status === "SCHEDULED" || mustDo.status === "COMPLETED",
    ).length,
  };
}

/**
 * Split trips into the dashboard's three shelves.
 *
 * A trip is "upcoming" while it is still being planned or is ready and has
 * not finished yet — a trip that ends today is still upcoming, because the
 * traveler is on it.
 */
export function categorizeTrips(
  trips: TripSummary[],
  today: string,
): { upcoming: TripSummary[]; drafts: TripSummary[]; past: TripSummary[] } {
  const upcoming: TripSummary[] = [];
  const drafts: TripSummary[] = [];
  const past: TripSummary[] = [];

  for (const trip of trips) {
    if (trip.status === "DRAFT") {
      drafts.push(trip);
    } else if (trip.status === "COMPLETED" || trip.status === "ARCHIVED") {
      past.push(trip);
    } else if (trip.endDate >= today) {
      upcoming.push(trip);
    } else {
      // Ready or planning, but the dates have passed. It belongs with the
      // trips that already happened rather than the ones still ahead.
      past.push(trip);
    }
  }

  upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  drafts.sort((a, b) => a.startDate.localeCompare(b.startDate));
  past.sort((a, b) => b.startDate.localeCompare(a.startDate));

  return { upcoming, drafts, past };
}

export interface ItemRowForStops {
  id: string;
  title: string;
  type: ItineraryItemType;
  startTime: Date;
  location: { name: string } | null;
  inboundLegs: {
    id: string;
    mode: TransportMode;
    departureTime: Date | null;
    durationMinutes: number;
    instructions: string | null;
    legOrder: number;
  }[];
}

/**
 * Flatten items and their inbound legs into a single ordered list of stops.
 *
 * This is the whole premise made visible: the walk and the subway ride are
 * stops on the route, sitting between the restaurant and the museum rather
 * than hidden underneath them.
 */
export function toNextStops(items: ItemRowForStops[]): NextStop[] {
  const stops: NextStop[] = [];

  for (const item of items) {
    const legs = [...item.inboundLegs].sort((a, b) => a.legOrder - b.legOrder);

    for (const leg of legs) {
      stops.push({
        id: `leg-${leg.id}`,
        title: leg.instructions ?? `${TRANSPORT_MODE_LABEL[leg.mode]} to ${item.title}`,
        type: leg.mode === "WALK" ? "WALKING" : "TRANSPORTATION",
        // A leg with no departure time still belongs on the route; anchor it
        // to the item it delivers to rather than dropping it.
        startTime: (leg.departureTime ?? item.startTime).toISOString(),
        location: null,
        mode: leg.mode,
      });
    }

    stops.push({
      id: item.id,
      title: item.title,
      type: item.type,
      startTime: item.startTime.toISOString(),
      location: item.location?.name ?? null,
      mode: null,
    });
  }

  return stops;
}

export interface LegRow {
  id: string;
  mode: TransportMode;
  durationMinutes: number;
  distanceMeters: number | null;
  estimatedCostCents: number;
  instructions: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  originLocation: { name: string } | null;
  destinationLocation: { name: string } | null;
  departureTime: Date | null;
  arrivalTime: Date | null;
  legOrder: number;
}

export interface ItemRow {
  id: string;
  type: ItineraryItemType;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  estimatedCostCents: number;
  reservationRequired: boolean;
  reservationStatus: ReservationStatus;
  priority: Priority;
  source: ItemSource;
  completed: boolean;
  isMock: boolean;
  sortOrder: number;
  location: { name: string; latitude: number | null; longitude: number | null } | null;
  inboundLegs: LegRow[];
}

export interface DayRow {
  id: string;
  dayNumber: number;
  date: Date;
  summary: string | null;
  itineraryItems: ItemRow[];
}

function toTimelineLeg(row: LegRow): TimelineLeg {
  const destination = row.destinationLocation?.name ?? row.destinationLabel;

  return {
    id: row.id,
    mode: row.mode,
    durationMinutes: row.durationMinutes,
    distanceMeters: row.distanceMeters,
    costCents: row.estimatedCostCents,
    // A leg with no stored instruction still has to read as something. The
    // mode label is worse than a real instruction and far better than blank.
    instructions:
      row.instructions ??
      `${TRANSPORT_MODE_LABEL[row.mode]}${destination ? ` to ${destination}` : ""}`,
    // A resolved place beats a free-text label: the label is what somebody
    // typed, the location is what the app knows.
    originLabel: row.originLocation?.name ?? row.originLabel,
    destinationLabel: destination,
    departureTime: row.departureTime?.toISOString() ?? null,
    arrivalTime: row.arrivalTime?.toISOString() ?? null,
    legOrder: row.legOrder,
  };
}

function toTimelineItem(row: ItemRow): TimelineItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationMinutes: row.durationMinutes,
    locationName: row.location?.name ?? null,
    latitude: row.location?.latitude ?? null,
    longitude: row.location?.longitude ?? null,
    estimatedCostCents: row.estimatedCostCents,
    reservationRequired: row.reservationRequired,
    reservationStatus: row.reservationStatus,
    priority: row.priority,
    source: row.source,
    isMustDo: row.source === "MUST_DO",
    completed: row.completed,
    isMock: row.isMock,
    legs: [...row.inboundLegs]
      .sort((a, b) => a.legOrder - b.legOrder)
      .map(toTimelineLeg),
  };
}

/**
 * Shape one day for the timeline, with the totals its header reports.
 *
 * Fares are counted alongside the things they get you to, because a day is
 * not cheap just because the museum was free. Travel time is kept separate
 * from scheduled time, and what is left over is reported as open — an
 * eleven-hour day with forty minutes of slack is worth knowing before you
 * are standing in it rather than after.
 */
export function toItineraryDay(row: DayRow): ItineraryDay {
  const items = [...row.itineraryItems]
    .sort(
      (a, b) =>
        a.startTime.getTime() - b.startTime.getTime() || a.sortOrder - b.sortOrder,
    )
    .map(toTimelineItem);

  let plannedCents = 0;
  let scheduledMinutes = 0;
  let travelMinutes = 0;
  let walkingMeters = 0;
  let startsAt: number | null = null;
  let endsAt: number | null = null;

  for (const item of items) {
    plannedCents += item.estimatedCostCents;
    scheduledMinutes += item.durationMinutes;

    const itemStart = Date.parse(item.startTime);
    const itemEnd = Date.parse(item.endTime);
    endsAt = endsAt === null ? itemEnd : Math.max(endsAt, itemEnd);

    // The day begins when the traveler starts moving, not when they arrive.
    let earliest = itemStart;
    for (const leg of item.legs) {
      plannedCents += leg.costCents;
      travelMinutes += leg.durationMinutes;
      if (leg.mode === "WALK") walkingMeters += leg.distanceMeters ?? 0;
      if (leg.departureTime) {
        earliest = Math.min(earliest, Date.parse(leg.departureTime));
      }
    }
    startsAt = startsAt === null ? earliest : Math.min(startsAt, earliest);
  }

  const first = items[0];
  const last = items[items.length - 1];
  const spanMinutes =
    first && last
      ? (Date.parse(last.endTime) - Date.parse(first.startTime)) / 60_000
      : 0;

  return {
    id: row.id,
    dayNumber: row.dayNumber,
    date: row.date.toISOString().slice(0, 10),
    summary: row.summary,
    items,
    totals: {
      itemCount: items.length,
      plannedCents,
      scheduledMinutes,
      travelMinutes,
      walkingMeters,
      // Overlapping items can consume more than the span; clamp rather than
      // reporting negative free time.
      openMinutes: Math.max(
        0,
        Math.round(spanMinutes - scheduledMinutes - travelMinutes),
      ),
    },
    startsAt: startsAt === null ? null : new Date(startsAt).toISOString(),
    endsAt: endsAt === null ? null : new Date(endsAt).toISOString(),
  };
}
