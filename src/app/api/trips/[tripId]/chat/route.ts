import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import {
  databaseUnavailable,
  notFound,
  rateLimited,
  toErrorBody,
} from "@/lib/errors";
import { aiRateLimiter } from "@/lib/rate-limit";
import { askAssistant } from "@/lib/ai/trip-chat";
import { commandSchema } from "@/lib/ai/chat-commands";
import {
  getItinerary,
  getTripBudget,
  applyChatCommands,
  listTripOptions,
} from "@/lib/repositories/trips";

/**
 * The per-trip assistant.
 *
 * Two modes, deliberately separate. Without `commands`, the assistant answers
 * and proposes changes without touching anything. With `commands`, the
 * traveler has reviewed a proposal and approved it, so it is applied.
 *
 * Splitting them means a model that misreads a request costs a click, not
 * somebody's Thursday.
 */

const askSchema = z.object({
  message: z.string().trim().min(1).max(1_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().max(600),
      }),
    )
    // The client sends this back on every request, so it is both untrusted
    // input and a cost multiplier. Six turns is what the prompt uses anyway.
    .max(6)
    .default([]),
});

const applySchema = z.object({
  commands: z.array(commandSchema).min(1).max(20),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  try {
    const user = await requireUser();
    const prisma = getPrisma();
    if (!prisma) throw databaseUnavailable();

    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId: user.id },
      include: { preference: true },
    });
    if (!trip) throw notFound("That trip does not exist.");

    const body: unknown = await request.json();

    // Applying an approved proposal: no model call, no rate limit.
    const apply = applySchema.safeParse(body);
    if (apply.success) {
      const outcome = await applyChatCommands(
        user.id,
        tripId,
        apply.data.commands,
      );
      return NextResponse.json({ applied: true, ...outcome });
    }

    const parsed = askSchema.parse(body);

    const limit = await aiRateLimiter().check(`chat:${user.id}`);
    if (!limit.allowed) {
      throw rateLimited(
        `You have sent a lot of messages recently. Try again in ${Math.ceil(
          limit.retryAfterSeconds / 60,
        )} minutes.`,
      );
    }

    const itinerary = await getItinerary(user.id, tripId);
    if (!itinerary || itinerary.days.length === 0) {
      throw notFound("Build an itinerary before asking about it.");
    }

    const [budget, options] = await Promise.all([
      getTripBudget(user.id, tripId),
      listTripOptions(user.id, tripId),
    ]);

    const outcome = await askAssistant({
      destination: trip.destination,
      currency: trip.currency,
      days: itinerary.days,
      budget,
      options,
      history: parsed.history,
      message: parsed.message,
    });

    return NextResponse.json({ applied: false, ...outcome });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "POST /api/trips/[tripId]/chat",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}
