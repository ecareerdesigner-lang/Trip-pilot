import "server-only";
import { getPrisma } from "@/lib/db";
import { unauthorized } from "@/lib/errors";
import { readSessionUserId } from "@/lib/auth/session";

/**
 * Who is asking.
 *
 * Every trip-scoped operation calls `requireUser()` and then
 * `assertOwnsTrip()`. That has been true since the first phase, which is why
 * adding real sessions is a change to this file rather than to fifty call
 * sites.
 *
 * With no database configured the app falls back to a single local owner, so
 * a fresh clone still runs. That fallback is off the moment a database is
 * present — otherwise anyone could reach a real user's trips by not signing
 * in, which is the opposite of what auth is for.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  currency: string;
  timezone: string;
}

/** Stable id used when no database is configured. */
export const LOCAL_OWNER_ID = "00000000-0000-4000-8000-000000000001";

const LOCAL_OWNER: SessionUser = {
  id: LOCAL_OWNER_ID,
  email: "owner@localhost",
  name: "Traveler",
  currency: "USD",
  timezone: "America/New_York",
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const prisma = getPrisma();

  // No database: nothing to sign in to, and nothing to protect.
  if (!prisma) return LOCAL_OWNER;

  const userId = await readSessionUserId();
  if (!userId) return null;

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      currency: true,
      timezone: true,
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name ?? "Traveler",
    currency: row.currency,
    timezone: row.timezone,
  };
}

/** Throws `AppError('UNAUTHORIZED')` when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/**
 * Ownership check for every trip-scoped operation.
 *
 * Separate from `requireUser` so it is impossible to forget one and still
 * look like the code did an auth check.
 */
export function assertOwnsTrip(
  user: SessionUser,
  trip: { userId: string },
): void {
  if (trip.userId !== user.id) {
    // Reported as unauthorized rather than forbidden, so probing UUIDs cannot
    // confirm that another user's trip exists.
    throw unauthorized("You do not have access to this trip.");
  }
}
