import "server-only";
import { providerMode } from "@/lib/env";
import { createRng } from "@/lib/providers/mock/rng";
import { resolveCity } from "@/lib/providers/mock/cities";
import { getMapsProvider } from "@/lib/providers/maps";
import { logger } from "@/lib/logger";
import type { WeatherDay, WeatherProvider, WeatherQuery } from "@/lib/providers/types";

/**
 * Weather.
 *
 * The mock produces seasonal normals for the destination's latitude, not a
 * forecast. It is labelled as sample data, and nothing in the app should
 * present it as a prediction — a trip four months out has no forecast to give.
 */

const SUMMARIES = [
  "Clear",
  "Partly cloudy",
  "Overcast",
  "Light rain",
  "Showers",
];

export class MockWeatherProvider implements WeatherProvider {
  async forecast(query: WeatherQuery): Promise<WeatherDay[]> {
    const city = resolveCity(query.destination);
    if (!city) return [];

    const start = new Date(`${query.dates.start}T00:00:00Z`);
    const end = new Date(`${query.dates.end}T00:00:00Z`);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days < 1 || days > 60) return [];

    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getTime() + index * 86_400_000);
      const iso = date.toISOString().slice(0, 10);
      const rng = createRng(`weather:${city.key}:${iso}`);

      // Seasonal swing from the day of year, damped toward the equator.
      const dayOfYear = Math.floor(
        (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000,
      );
      const seasonal = Math.cos(((dayOfYear - 200) / 365) * 2 * Math.PI);
      const latitudeFactor = Math.min(1, Math.abs(city.center.latitude) / 55);
      const high = Math.round(
        20 + seasonal * 13 * latitudeFactor + rng.float(-3, 3),
      );

      return {
        providerName: "mock",
        isMock: true,
        date: iso,
        highCelsius: high,
        lowCelsius: high - rng.int(6, 11),
        precipitationChance: rng.int(5, 60),
        summary: rng.pick(SUMMARIES),
      };
    });
  }
}

/**
 * Open-Meteo — free, open, no API key required.
 * https://open-meteo.com/en/docs
 *
 * Two endpoints, chosen by how far out the trip is:
 *   - Forecast (api.open-meteo.com), reaches 16 days ahead — a real
 *     prediction, used when the trip start is within that window.
 *   - Archive (archive-api.open-meteo.com), historical record back to
 *     1940 — used for anything further out, requesting the same calendar
 *     dates one year ago as a real, honestly-labelled "what actually
 *     happened last year" rather than the mock's synthetic curve. This is
 *     not a forecast either — nothing is, that far out — but it is real
 *     recorded weather rather than an invented seasonal shape.
 *
 * WEATHER_API_KEY still gates this provider even though Open-Meteo does not
 * use it, matching every other provider's "mode and key both set, or it
 * stays mock" rule — a placeholder value is enough.
 */

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_WINDOW_DAYS = 16;

// https://open-meteo.com/en/docs — WMO weather interpretation codes, the
// subset Open-Meteo actually returns.
const WEATHER_CODE_SUMMARY: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

function summarize(code: number | undefined): string {
  if (code === undefined) return "Unknown";
  return WEATHER_CODE_SUMMARY[code] ?? "Unknown";
}

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max?: (number | null)[];
  precipitation_sum?: number[];
  weathercode?: number[];
  weather_code?: number[];
}

interface OpenMeteoResponse {
  daily?: OpenMeteoDaily;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysFromToday(iso: string): number {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const start = new Date(`${todayIso}T00:00:00Z`);
  const target = new Date(`${iso}T00:00:00Z`);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

async function fetchDaily(
  endpoint: string,
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
  dailyFields: string,
  timeoutMs = 10_000,
): Promise<OpenMeteoDaily | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(endpoint);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("daily", dailyFields);
    url.searchParams.set("timezone", "auto");

    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      logger.error("Open-Meteo request failed", {
        status: response.status,
        endpoint,
      });
      return null;
    }

    const data = (await response.json()) as OpenMeteoResponse;
    return data.daily ?? null;
  } catch (error) {
    logger.error("Open-Meteo request threw", {
      message: error instanceof Error ? error.message : String(error),
      endpoint,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  async forecast(query: WeatherQuery): Promise<WeatherDay[]> {
    const geocoded = await getMapsProvider().geocode(query.destination);
    if (!geocoded) return [];
    const { latitude, longitude } = geocoded.place;
    if (latitude == null || longitude == null) return [];

    const withinForecastWindow =
      daysFromToday(query.dates.start) <= FORECAST_WINDOW_DAYS;

    const isForecast = withinForecastWindow;
    const endpoint = isForecast ? FORECAST_ENDPOINT : ARCHIVE_ENDPOINT;
    // A trip too far out for a real forecast gets the same calendar dates
    // from one year ago instead — real recorded weather, not a guess.
    const requestStart = isForecast
      ? query.dates.start
      : addDays(query.dates.start, -365);
    const requestEnd = isForecast
      ? query.dates.end
      : addDays(query.dates.end, -365);

    const dailyFields = isForecast
      ? "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"
      : "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code";

    const daily = await fetchDaily(
      endpoint,
      latitude,
      longitude,
      requestStart,
      requestEnd,
      dailyFields,
    );
    if (!daily) return [];

    // Map results back onto the dates actually requested, not the (possibly
    // year-shifted) dates that were queried.
    const originalStart = new Date(`${query.dates.start}T00:00:00Z`);

    return daily.time.map((_, index) => {
      const displayDate = new Date(
        originalStart.getTime() + index * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);

      const code = daily.weather_code?.[index] ?? daily.weathercode?.[index];
      const precipSum = daily.precipitation_sum?.[index];
      const precipProbability = daily.precipitation_probability_max?.[index];

      return {
        providerName: "open-meteo",
        isMock: false,
        date: displayDate,
        highCelsius: Math.round(daily.temperature_2m_max[index] ?? 0),
        lowCelsius: Math.round(daily.temperature_2m_min[index] ?? 0),
        // Archive data has no probability, only whether it actually rained —
        // 80/10 is a coarse but honest translation of "it did" / "it didn't".
        precipitationChance:
          precipProbability ?? (precipSum && precipSum > 0.5 ? 80 : 10),
        summary: summarize(code),
      };
    });
  }
}

export function getWeatherProvider(): WeatherProvider {
  switch (providerMode("weather")) {
    case "open-meteo":
      return new OpenMeteoWeatherProvider();
    default:
      return new MockWeatherProvider();
  }
}
