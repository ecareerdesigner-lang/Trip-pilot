import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { addItineraryItem } from "@/lib/repositories/trips";
import { newItemSchema } from "@/lib/validation/itinerary-item";

/** Add an item the traveler asked for. Saved as theirs, so rebuilds keep it. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  try {
    const user = await requireUser();
    const payload = newItemSchema.parse(await request.json());
    const day = await addItineraryItem(user.id, tripId, payload);
    return NextResponse.json({ day }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "POST /api/trips/[tripId]/itinerary",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}
