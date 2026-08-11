import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { notFound, toErrorBody } from "@/lib/errors";
import { getTripBudget } from "@/lib/repositories/trips";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  try {
    const user = await requireUser();
    const report = await getTripBudget(user.id, tripId);
    if (!report) throw notFound("That trip does not exist.");
    return NextResponse.json({ budget: report });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "GET /api/trips/[tripId]/budget",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}
