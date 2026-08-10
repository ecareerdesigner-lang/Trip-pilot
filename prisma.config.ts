import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * `dotenv/config` must be imported first. A Prisma config file turns off the
 * CLI's automatic .env loading, so without it DATABASE_URL is invisible to
 * `prisma validate`, `generate`, `db push` and `migrate`.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
