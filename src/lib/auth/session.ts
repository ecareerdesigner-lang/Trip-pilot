import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  signSession,
  verifySession,
  sessionExpiry,
  SESSION_DAYS,
} from "@/lib/auth/crypto";

/**
 * Session cookie handling.
 *
 * httpOnly so script cannot read it, sameSite lax so it survives a normal
 * navigation but not a cross-site form post, and secure in production.
 */

const COOKIE_NAME = "trippilot_session";

function secret(): string {
  const value = env().AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new AppError(
      "INTERNAL",
      "AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and put it in .env.",
    );
  }
  return value;
}

export async function createSession(userId: string): Promise<void> {
  const expiresAt = sessionExpiry();
  const token = signSession({ userId, expiresAt }, secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** The signed-in user's id, or null. Never throws on a bad cookie. */
export async function readSessionUserId(): Promise<string | null> {
  let token: string | undefined;
  try {
    const store = await cookies();
    token = store.get(COOKIE_NAME)?.value;
  } catch {
    // Outside a request scope, e.g. during static generation.
    return null;
  }

  if (!token) return null;

  try {
    return verifySession(token, secret())?.userId ?? null;
  } catch {
    // A missing AUTH_SECRET must not crash every page. It surfaces as
    // signed-out, and the sign-in route reports it properly.
    return null;
  }
}
