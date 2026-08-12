"use server";

import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import { createSession, destroySession } from "@/lib/auth/session";
import { isObviousPassword, signInSchema, signUpSchema } from "@/lib/validation/auth";

/**
 * Sign in, sign up, sign out.
 *
 * Failures are returned rather than thrown, so the form can show them in
 * place instead of replacing a half-filled form with an error page.
 */

export type AuthResult =
  | { ok: true }
  | { ok: false; message: string; field?: "email" | "password" | "name" };

/**
 * Deliberately vague on failure.
 *
 * "No account with that email" tells anyone who asks which addresses are
 * registered. One message for both cases gives that away to nobody.
 */
const BAD_CREDENTIALS =
  "That email and password do not match an account.";

export async function signInAction(input: unknown): Promise<AuthResult> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      ok: false,
      message: "Signing in needs a database. Set DATABASE_URL and run `npm run db:push`.",
    };
  }

  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.message ?? "Check the details and try again.",
      field: issue?.path[0] as AuthResult extends { field?: infer F } ? F : never,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });

  // Hash anyway when the account does not exist, so the response takes the
  // same time either way. A fast rejection is a working account enumerator.
  const hash =
    user?.passwordHash ??
    "scrypt$16384$8$1$00000000000000000000000000000000$00";

  const valid = await verifyPassword(parsed.data.password, hash);

  if (!user?.passwordHash || !valid) {
    logger.warn("Failed sign-in attempt");
    return { ok: false, message: BAD_CREDENTIALS };
  }

  await createSession(user.id);
  return { ok: true };
}

export async function signUpAction(input: unknown): Promise<AuthResult> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      ok: false,
      message: "Creating an account needs a database. Set DATABASE_URL and run `npm run db:push`.",
    };
  }

  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.message ?? "Check the details and try again.",
      field: issue?.path[0] as AuthResult extends { field?: infer F } ? F : never,
    };
  }

  if (isObviousPassword(parsed.data.password)) {
    return {
      ok: false,
      field: "password",
      message: "That password is too easy to guess. Try a phrase instead.",
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (existing) {
    // Naming the conflict here is unavoidable — the person has to know why
    // they cannot proceed — but it is the only place that reveals it.
    return {
      ok: false,
      field: "email",
      message: "An account already uses that email. Try signing in instead.",
    };
  }

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
    },
    select: { id: true },
  });

  await createSession(user.id);
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/sign-in");
}
