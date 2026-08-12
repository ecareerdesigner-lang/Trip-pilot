import { formatMoney } from "@/lib/money";
import type { CandidateSet } from "@/lib/travel/candidates";
import type { FoodPreference, Pace, TransportPreference } from "@/types/domain";
import {
  FOOD_PREFERENCE_LABEL,
  PACE_ACTIVITY_TARGET,
  PACE_BUFFER_MINUTES,
  PACE_DESCRIPTION,
  TRANSPORT_PREFERENCE_LABEL,
} from "@/lib/constants";

/**
 * Prompt construction.
 *
 * The model is given concrete candidates and asked to choose among them. It
 * is never asked to recall a price, an address or an opening time, because it
 * will produce a plausible one. Every fact it needs is in the prompt, and
 * every fact it returns is re-read from the candidate by the plan builder.
 */

export interface PromptInput {
  origin: string;
  destination: string;
  dayDates: string[];
  travelers: number;
  pace: Pace;
  foodPreference: FoodPreference;
  transportPreferences: TransportPreference[];
  mustDos: { title: string; description: string }[];
  notes: string;
  totalBudgetCents: number | null;
  dayStartMinute: number;
  dayEndMinute: number;
  candidates: CandidateSet;
}

const minuteToClock = (minute: number): string => {
  const hour = Math.floor(minute / 60);
  const rest = String(minute % 60).padStart(2, "0");
  return `${String(hour).padStart(2, "0")}:${rest}`;
};

export const SYSTEM_PROMPT = `You are the itinerary planner inside TripPilot, a travel planning app.

You arrange a trip from a fixed list of real options supplied to you. You do not invent places, prices, opening hours or travel times.

Rules you must follow:
1. Every item that happens at a place must reference one of the supplied candidate ids. Never write an id that was not given to you.
2. Must-dos are requirements. Schedule every must-do that matches a supplied candidate before adding anything optional. If a must-do has no matching candidate, leave it out and do not substitute something similar.
3. Never schedule a place outside its opening hours, and never let an item run past closing.
4. Leave real time between items. The traveler has to physically cross the city, and the app computes those journeys from your schedule. Getting between two places usually takes 20 to 40 minutes, and on top of that leave the slack stated below — a day where every connection is exact falls apart the moment one train is late. Items that overlap or sit back to back produce a day nobody can follow.
5. Schedule meals at mealtimes and do not schedule the same restaurant twice.
6. Respect the requested pace. A relaxed day has fewer items with more room around them.
7. Stay inside the traveler's stated hours.
8. Cluster each day geographically. Do not cross the city and come back.

Return ONLY a JSON object. No prose, no markdown fences, no commentary.

{
  "tripSummary": "two or three sentences about the shape of the trip",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "summary": "one line about this day",
      "items": [
        {
          "candidateId": "a3",
          "type": "SIGHTSEEING",
          "title": "short title",
          "description": "one or two sentences",
          "startMinute": 600,
          "durationMinutes": 120,
          "satisfiesMustDo": "the exact must-do text, or null"
        }
      ]
    }
  ]
}

startMinute is minutes from local midnight: 09:30 is 570. Valid types are TRAVEL, LODGING, RESTAURANT, ACTIVITY, EXCURSION, SIGHTSEEING, TRANSPORTATION, WALKING, FREE_TIME, OTHER. Use candidateId null only for FREE_TIME.`;

export function buildUserPrompt(input: PromptInput): string {
  const lines: string[] = [];

  lines.push(`Trip: ${input.origin} to ${input.destination}`);
  lines.push(`Dates: ${input.dayDates.join(", ")}`);
  lines.push(`Travelers: ${input.travelers}`);
  lines.push(
    `Pace: ${input.pace} — ${PACE_DESCRIPTION[input.pace]} Aim for about ${
      PACE_ACTIVITY_TARGET[input.pace]
    } scheduled things per day.`,
  );
  // The number the builder enforces. Stated rather than implied, so the
  // model is not guessing at what "slack" means.
  lines.push(
    `Leave at least ${PACE_BUFFER_MINUTES[input.pace]} minutes of slack after each journey, on top of the travel time itself.`,
  );
  lines.push(`Food preference: ${FOOD_PREFERENCE_LABEL[input.foodPreference]}`);

  if (input.transportPreferences.length > 0) {
    lines.push(
      `Getting around: ${input.transportPreferences
        .map((preference) => TRANSPORT_PREFERENCE_LABEL[preference])
        .join(", ")}`,
    );
  }

  lines.push(
    `Hours to schedule within: ${minuteToClock(input.dayStartMinute)} to ${minuteToClock(input.dayEndMinute)}`,
  );

  if (input.totalBudgetCents !== null) {
    lines.push(
      `Total budget for the whole trip: ${formatMoney(input.totalBudgetCents)}. Prices below are per the unit stated.`,
    );
  }

  lines.push("");
  lines.push(
    input.mustDos.length > 0
      ? `MUST-DOS (requirements, schedule these first):\n${input.mustDos
          .map((mustDo) =>
            `- ${mustDo.title}${mustDo.description ? ` — ${mustDo.description}` : ""}`,
          )
          .join("\n")}`
      : "MUST-DOS: none given.",
  );

  if (input.notes.trim()) {
    lines.push("");
    lines.push(`TRAVELER NOTES:\n${input.notes.trim()}`);
  }

  lines.push("");
  lines.push("LODGING OPTIONS (pick one and stay there the whole trip):");
  for (const [id, hotel] of input.candidates.hotels) {
    lines.push(
      `${id} | ${hotel.name} | ${hotel.starRating}-star | ${formatMoney(
        hotel.nightlyRateCents,
      )}/night | ${formatMoney(hotel.totalRateCents)} total | rated ${
        hotel.reviewScore
      } | check-in ${hotel.checkInTime}, check-out ${hotel.checkOutTime}`,
    );
  }

  lines.push("");
  lines.push("RESTAURANTS (per person cost, do not repeat one):");
  for (const [id, restaurant] of input.candidates.restaurants) {
    lines.push(
      `${id} | ${restaurant.name} | ${restaurant.cuisines.join("/")} | ${formatMoney(
        restaurant.averageMealCents,
      )}pp | open ${minuteToClock(restaurant.hours.opensMinute)}-${minuteToClock(
        restaurant.hours.closesMinute,
      )} | rated ${restaurant.reviewScore}${
        restaurant.reservationRequired ? " | booking needed" : ""
      }`,
    );
  }

  lines.push("");
  lines.push("ACTIVITIES (per person cost):");
  for (const [id, activity] of input.candidates.activities) {
    lines.push(
      `${id} | ${activity.name} | ${activity.category} | ${
        activity.priceCents === 0 ? "free" : `${formatMoney(activity.priceCents)}pp`
      } | typical visit ${activity.durationMinutes} min | open ${minuteToClock(
        activity.hours.opensMinute,
      )}-${minuteToClock(activity.hours.closesMinute)} | rated ${
        activity.reviewScore
      }${activity.bookingRequired ? " | booking needed" : ""}`,
    );
  }

  if (input.candidates.weather.length > 0) {
    lines.push("");
    lines.push("WEATHER (seasonal normals, not a forecast):");
    for (const day of input.candidates.weather) {
      lines.push(
        `${day.date} | ${day.highCelsius}°C / ${day.lowCelsius}°C | ${day.summary} | ${day.precipitationChance}% rain`,
      );
    }
  }

  lines.push("");
  lines.push("Return the JSON object now.");

  return lines.join("\n");
}
