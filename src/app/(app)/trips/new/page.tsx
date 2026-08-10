import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NotBuiltYet } from "@/components/ui/not-built-yet";

export const metadata: Metadata = { title: "Plan a new trip" };

export default function NewTripPage() {
  return (
    <>
      <PageHeader
        eyebrow="New trip"
        title="Plan a new trip"
        description="Seven steps: where you are going, how you are getting there, what you have to spend, how you like to travel, what you refuse to miss, anything else, then build."
      />
      <NotBuiltYet
        feature="The trip wizard"
        phase="Phase 11"
        detail="Destination, transportation, budget, preferences, must-dos, notes, and the build screen."
      />
    </>
  );
}
