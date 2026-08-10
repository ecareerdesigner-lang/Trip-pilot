import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * Environment variables are loaded from `.env` by Next.js at runtime; the
 * Prisma CLI needs them loaded explicitly, which `dotenv/config` handles via
 * the `--env-file` flag in the npm scripts, or via the shell on CI.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
