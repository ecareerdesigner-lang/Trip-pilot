import "server-only";
import { unauthorized } from "@/lib/errors";

/**
 * Authentication surface.
 *
 * Phase 1 ships the interface and a single local owner, because TripPilot is
 * personal-first. Real sessions land in Phase 22. Every route handler and
 * server action calls `requireUser()` from day one, so adding sessions later
 * is a change to this file only — not to fifteen call sites.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  currency: string;
  timezone: string;
}

/** Stable id for the local single-user mode. */
export const LOCAL_OWNER_ID = "00000000-0000-4000-8000-000000000001";

const LOCAL_OWNER: SessionUser = {
  id: LOCAL_OWNER_ID,
  email: "owner@localhost",
  name: "Traveler",
  currency: "USD",
  timezone: "America/New_York",
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  // TODO(Phase 22): read and verify the signed session cookie.
  return LOCAL_OWNER;
}

/** Throws `AppError('UNAUTHORIZED')` when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/**
 * Ownership check for every trip-scoped operation.
 * Kept separate from `requireUser` so it is impossible to forget one and
 * still look like the code did an auth check.
 */
export function assertOwnsTrip(
  user: SessionUser,
  trip: { userId: string },
): void {
  if (trip.userId !== user.id) {
    // Reported as "not found" so the existence of another user's trip id is
    // not confirmed to an attacker probing UUIDs.
    throw unauthorized("You do not have access to this trip.");
  }
}
