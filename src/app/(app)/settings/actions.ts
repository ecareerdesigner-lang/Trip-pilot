"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { toErrorBody } from "@/lib/errors";
import { profileSchema } from "@/lib/validation/profile";

export type ProfileResult =
  | { ok: true }
  | { ok: false; message: string; field?: string };

export async function saveProfileAction(
  input: unknown,
): Promise<ProfileResult> {
  try {
    const user = await requireUser();
    const prisma = getPrisma();
    if (!prisma) {
      return {
        ok: false,
        message: "Saving settings needs a database connection.",
      };
    }

    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        message: issue?.message ?? "Check the details and try again.",
        field: issue?.path[0]?.toString(),
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        homeCity: parsed.data.homeCity || null,
        currency: parsed.data.currency,
        timezone: parsed.data.timezone,
      },
    });

    // Currency formats prices on every page, so nothing may keep the old one.
    revalidatePath("/", "layout");

    return { ok: true };
  } catch (error) {
    const { body } = toErrorBody(error, { action: "saveProfileAction" });
    return { ok: false, message: body.error.message };
  }
}
