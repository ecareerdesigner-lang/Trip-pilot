import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { notFound, toErrorBody } from "@/lib/errors";
import { getTripTransportation } from "@/lib/repositories/trips";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  try {
    const user = await requireUser();
    const report = await getTripTransportation(user.id, tripId);
    if (!report) throw notFound("That trip does not exist.");
    return NextResponse.json({ transportation: report });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "GET /api/trips/[tripId]/transportation",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}
