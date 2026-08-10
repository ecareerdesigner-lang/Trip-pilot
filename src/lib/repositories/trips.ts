import "server-only";
import { getPrisma } from "@/lib/db";
import { sampleDashboardData, sampleTrips } from "@/lib/sample-trips";
import type { DashboardData, TripSummary } from "@/types/view";

/**
 * Trip data access.
 *
 * One seam between the pages and the database. While no database is
 * connected, this returns the sample dataset and reports `source: "sample"`
 * so the UI can say so out loud. Phase 12 fills in the query branches; no
 * page changes when it does.
 */

export async function getDashboardData(
  _userId: string,
): Promise<DashboardData> {
  const prisma = getPrisma();
  if (!prisma) return sampleDashboardData();

  // TODO(Phase 12): replace with real queries once the schema is migrated.
  //   const trips = await prisma.trip.findMany({ where: { userId } });
  return sampleDashboardData();
}

export async function listTrips(_userId: string): Promise<{
  trips: TripSummary[];
  source: "database" | "sample";
}> {
  const prisma = getPrisma();
  if (!prisma) return { trips: sampleTrips(), source: "sample" };

  // TODO(Phase 12): real query.
  return { trips: sampleTrips(), source: "sample" };
}
