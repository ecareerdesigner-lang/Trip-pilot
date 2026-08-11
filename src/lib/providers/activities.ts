import { providerMode } from "@/lib/env";
import { resolveCity } from "@/lib/providers/mock/cities";
import { generateActivities } from "@/lib/providers/mock/catalog";
import type {
  ActivityCandidate,
  ActivityProvider,
  ActivityQuery,
} from "@/lib/providers/types";

export class MockActivityProvider implements ActivityProvider {
  async search(query: ActivityQuery): Promise<ActivityCandidate[]> {
    const city = resolveCity(query.destination);
    if (!city) return [];

    let results = generateActivities(city, String(query.travelers));

    if (query.categories && query.categories.length > 0) {
      const wanted = query.categories.map((category) => category.toLowerCase());
      const matching = results.filter((activity) =>
        wanted.includes(activity.category.toLowerCase()),
      );
      if (matching.length > 0) results = matching;
    }

    if (query.maxPriceCents !== undefined) {
      results = results.filter(
        (activity) => activity.priceCents <= query.maxPriceCents!,
      );
    }

    return results
      .sort((a, b) => b.reviewScore - a.reviewScore)
      .slice(0, query.limit ?? 10);
  }
}

export function getActivityProvider(): ActivityProvider {
  switch (providerMode("activities")) {
    default:
      return new MockActivityProvider();
  }
}
