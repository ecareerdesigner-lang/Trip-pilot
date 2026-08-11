import { TRANSPORT_MODE_LABEL } from "@/lib/constants";
import type { TransportMode } from "@/types/domain";
import type { ItineraryDay, TimelineItem, TimelineLeg } from "@/types/view";

/**
 * Transportation engine.
 *
 * Assembles scattered legs back into the journeys a traveler actually takes.
 * A walk, a subway ride and another walk are one trip to the museum, and are
 * reported as one — with the total that matters, which is door to door.
 */

export interface Journey {
  /** The item this journey delivers the traveler to. */
  toItemId: string;
  toTitle: string;
  /** ISO datetimes. */
  departureTime: string | null;
  arrivalTime: string;
  legs: TimelineLeg[];
  totalMinutes: number;
  totalCostCents: number;
  totalMeters: number;
  /** Modes in order, deduplicated only where they repeat consecutively. */
  modes: TransportMode[];
  /** "Walk, subway, walk" — the shape of the journey in one phrase. */
  shape: string;
}

export interface DayJourneys {
  dayNumber: number;
  date: string;
  journeys: Journey[];
  totalMinutes: number;
  totalCostCents: number;
}

export interface ModeSummary {
  mode: TransportMode;
  legCount: number;
  totalMinutes: number;
  totalMeters: number;
  totalCostCents: number;
}

export interface TransportationReport {
  days: DayJourneys[];
  byMode: ModeSummary[];
  totalMinutes: number;
  totalCostCents: number;
  totalMeters: number;
  journeyCount: number;
  /** The single longest journey, which is usually the one worth rethinking. */
  longestJourney: Journey | null;
}

function toJourney(item: TimelineItem): Journey | null {
  if (item.legs.length === 0) return null;

  const legs = [...item.legs].sort((a, b) => a.legOrder - b.legOrder);
  const modes: TransportMode[] = [];
  for (const leg of legs) {
    // Two consecutive subway legs are one subway ride as far as the shape of
    // the journey is concerned; a walk between them is not.
    if (modes[modes.length - 1] !== leg.mode) modes.push(leg.mode);
  }

  return {
    toItemId: item.id,
    toTitle: item.title,
    departureTime: legs[0]?.departureTime ?? null,
    arrivalTime: item.startTime,
    legs,
    totalMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
    totalCostCents: legs.reduce((sum, leg) => sum + leg.costCents, 0),
    totalMeters: legs.reduce((sum, leg) => sum + (leg.distanceMeters ?? 0), 0),
    modes,
    shape: modes.map((mode) => TRANSPORT_MODE_LABEL[mode]).join(" → "),
  };
}

export function buildTransportationReport(
  days: ItineraryDay[],
): TransportationReport {
  const byMode = new Map<TransportMode, ModeSummary>();
  const dayJourneys: DayJourneys[] = [];

  let totalMinutes = 0;
  let totalCostCents = 0;
  let totalMeters = 0;
  let longestJourney: Journey | null = null;

  for (const day of days) {
    const journeys = day.items
      .map(toJourney)
      .filter((journey): journey is Journey => journey !== null);

    for (const journey of journeys) {
      totalMinutes += journey.totalMinutes;
      totalCostCents += journey.totalCostCents;
      totalMeters += journey.totalMeters;

      if (
        longestJourney === null ||
        journey.totalMinutes > longestJourney.totalMinutes
      ) {
        longestJourney = journey;
      }

      for (const leg of journey.legs) {
        const existing = byMode.get(leg.mode) ?? {
          mode: leg.mode,
          legCount: 0,
          totalMinutes: 0,
          totalMeters: 0,
          totalCostCents: 0,
        };
        existing.legCount += 1;
        existing.totalMinutes += leg.durationMinutes;
        existing.totalMeters += leg.distanceMeters ?? 0;
        existing.totalCostCents += leg.costCents;
        byMode.set(leg.mode, existing);
      }
    }

    dayJourneys.push({
      dayNumber: day.dayNumber,
      date: day.date,
      journeys,
      totalMinutes: journeys.reduce((sum, journey) => sum + journey.totalMinutes, 0),
      totalCostCents: journeys.reduce(
        (sum, journey) => sum + journey.totalCostCents,
        0,
      ),
    });
  }

  return {
    days: dayJourneys,
    // Most-used mode first: that is the one the traveler will feel.
    byMode: [...byMode.values()].sort((a, b) => b.totalMinutes - a.totalMinutes),
    totalMinutes,
    totalCostCents,
    totalMeters,
    journeyCount: dayJourneys.reduce((sum, day) => sum + day.journeys.length, 0),
    longestJourney,
  };
}
