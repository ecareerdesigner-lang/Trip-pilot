import { providerMode } from "@/lib/env";
import { planRoute } from "@/lib/travel/routing";
import type {
  TransitProvider,
  TransitQuery,
  TransitRoute,
} from "@/lib/providers/types";

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

export function getTransitProvider(): TransitProvider {
  switch (providerMode("transit")) {
    // TODO(Phase 23): live routing implementations land here.
    default:
      return new MockTransitProvider();
  }
}
