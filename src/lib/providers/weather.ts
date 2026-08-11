import { providerMode } from "@/lib/env";
import { createRng } from "@/lib/providers/mock/rng";
import { resolveCity } from "@/lib/providers/mock/cities";
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

export function getWeatherProvider(): WeatherProvider {
  switch (providerMode("weather")) {
    default:
      return new MockWeatherProvider();
  }
}
