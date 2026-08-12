import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, toErrorBody } from "@/lib/errors";
import {
  removeItineraryItem,
  updateItineraryItem,
} from "@/lib/repositories/trips";
import { updateItemSchema } from "@/lib/validation/itinerary-item";

/**
 * Edit or remove one item.
 *
 * Both return the whole day, because changing one item changes the journeys
 * around it — returning only the edited row would leave the client showing a
 * schedule that no longer matches the one on the server.
 */

function requireDayId(request: Request): string {
  const dayId = new URL(request.url).searchParams.get("dayId");
  if (!dayId) throw badRequest("Which day is this item on?");
  return dayId;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tripId: string; itemId: string }> },
) {
  const { tripId, itemId } = await params;
  try {
    const user = await requireUser();
    const dayId = requireDayId(request);
    const payload = updateItemSchema.parse(await request.json());
    const day = await updateItineraryItem(user.id, tripId, dayId, itemId, payload);
    return NextResponse.json({ day });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "PATCH /api/trips/[tripId]/itinerary/[itemId]",
      tripId,
      itemId,
    });
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tripId: string; itemId: string }> },
) {
  const { tripId, itemId } = await params;
  try {
    const user = await requireUser();
    const dayId = requireDayId(request);
    const day = await removeItineraryItem(user.id, tripId, dayId, itemId);
    return NextResponse.json({ day });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "DELETE /api/trips/[tripId]/itinerary/[itemId]",
      tripId,
      itemId,
    });
    return NextResponse.json(body, { status });
  }
}
