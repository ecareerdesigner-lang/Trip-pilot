import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { TripWizard } from "@/components/trips/wizard/trip-wizard";

export const metadata: Metadata = { title: "Plan a new trip" };

export default function NewTripPage() {
  return (
    <>
      <PageHeader
        eyebrow="New trip"
        title="Plan a new trip"
        description="Seven steps. Only the first two need answers — everything else has a sensible default."
      />
      <TripWizard />
    </>
  );
}
