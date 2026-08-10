import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NotBuiltYet } from "@/components/ui/not-built-yet";

export const metadata: Metadata = { title: "Trip" };

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <>
      <PageHeader
        eyebrow="Trip"
        title="Trip overview"
        description={`Overview, itinerary, map, budget, transportation, reservations and documents for trip ${tripId}.`}
      />
      <NotBuiltYet
        feature="The trip view"
        phase="Phase 12"
        detail="Header with dates, travelers and budget, plus the seven trip tabs."
      />
    </>
  );
}
