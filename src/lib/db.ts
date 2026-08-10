import "server-only";
import { PrismaClient } from "@prisma/client";
import { env, isDatabaseConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Prisma client accessor.
 *
 * Deliberately lazy and nullable. The app must boot, build and render on a
 * machine with no DATABASE_URL and no generated client — the UI then falls
 * back to clearly-labelled sample data rather than crashing. Once the
 * database is configured, `getPrisma()` returns a real client and the data
 * layer switches over with no other changes.
 *
 * Set up a database:
 *   1. Put a PostgreSQL connection string in DATABASE_URL
 *   2. npm run db:generate
 *   3. npm run db:push
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaFailed: boolean | undefined;
};

export function getPrisma(): PrismaClient | null {
  if (!isDatabaseConfigured()) return null;
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  if (globalForPrisma.prismaFailed) return null;

  try {
    const client = new PrismaClient({
      log:
        env().NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });

    // Cached on globalThis so Next.js hot reloads do not open a new pool
    // on every edit.
    if (env().NODE_ENV !== "production") {
      globalForPrisma.prisma = client;
    }
    return client;
  } catch (error) {
    globalForPrisma.prismaFailed = true;
    logger.error("Prisma client is not available", {
      message: error instanceof Error ? error.message : String(error),
      hint: "Run `npm run db:generate` after setting DATABASE_URL.",
    });
    return null;
  }
}

/** True when queries can actually be issued right now. */
export function hasDatabase(): boolean {
  return getPrisma() !== null;
}
