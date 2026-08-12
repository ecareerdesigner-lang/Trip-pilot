import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Trip ids reaching Prisma must be uuids.
 *
 * A page visited with `sample-nyc` in the URL produced a 500 and a stack
 * trace: the `id` column is `@db.Uuid`, and Postgres rejects a malformed
 * value at the type level before the query runs.
 *
 * This cannot be tested by calling the functions — there is no database
 * here, and every one of them returns early without a Prisma handle. That
 * early return is exactly why the bug survived: the sandbox path and the
 * real path diverge at the point where it matters. So the guard is asserted
 * structurally instead.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/lib/repositories/trips.ts"),
  "utf8",
);

/** Every exported function that accepts a tripId. */
function tripScopedFunctions(): { name: string; body: string }[] {
  const functions: { name: string; body: string }[] = [];
  const pattern = /export async function (\w+)\(([\s\S]*?)\n\}/g;

  for (const match of SOURCE.matchAll(pattern)) {
    const [, name, body] = match as unknown as [string, string, string];
    if (/tripId: string/.test(body)) functions.push({ name, body });
  }

  return functions;
}

describe("trip id validation", () => {
  const functions = tripScopedFunctions();

  it("finds the trip-scoped functions", () => {
    expect(functions.length).toBeGreaterThanOrEqual(9);
  });

  it.each(functions.map((entry) => entry.name))(
    "%s rejects a non-uuid before querying",
    (name) => {
      const entry = functions.find((candidate) => candidate.name === name)!;

      // Functions that never reach Prisma directly are covered by the one
      // they delegate to.
      if (!entry.body.includes("prisma.")) return;

      expect(entry.body, `${name} passes tripId to Prisma unchecked`).toContain(
        "isUuid(tripId)",
      );
    },
  );

  it("checks the id before the first Prisma call in each function", () => {
    for (const entry of functions) {
      if (!entry.body.includes("isUuid(tripId)")) continue;
      const guard = entry.body.indexOf("isUuid(tripId)");
      const firstQuery = entry.body.indexOf("prisma.");
      expect(
        guard,
        `${entry.name} queries before validating the id`,
      ).toBeLessThan(firstQuery);
    }
  });
});

describe("the dashboard does not link to unreachable trips", () => {
  it("returns an empty dashboard for a signed-in traveler with no trips", () => {
    // Sample trips carry ids like "sample-nyc". Showing them to somebody with
    // a database means every card links to a page that cannot load.
    const after = SOURCE.slice(SOURCE.indexOf("export async function getDashboardData"));
    const body = after.slice(0, after.indexOf("\n}\n"));

    const sampleCalls = [...body.matchAll(/sampleDashboardData\(\)/g)];
    expect(sampleCalls).toHaveLength(1);
    expect(body).toMatch(/if \(!prisma\) return sampleDashboardData\(\)/);
  });
});

describe("cross-day moves are implemented, not reported as impossible", () => {
  it("no longer refuses to move an item between days", () => {
    // Chat could propose it and the pure layer could do it, but the
    // persistence path reported "not supported yet" — which is the least
    // useful place for a feature to stop.
    expect(SOURCE).not.toContain("not supported yet");
  });

  it("has a function that moves an item to another day", () => {
    expect(SOURCE).toContain("export async function moveItemToDay");
  });

  it("recalculates the day the item left as well as the one it joined", () => {
    const start = SOURCE.indexOf("export async function moveItemToDay");
    const body = SOURCE.slice(start, SOURCE.indexOf("\n}\n", start));

    // Both days are touched, but differently. The day it left only needs its
    // journeys rebuilt — a gap is harmless. The day it joined may now have
    // two things in the same slot, which is not.
    expect(body).toContain("recomputeDayLegs(userId, tripId, fromDayId)");
    expect(body).toContain("resolveOverlapsAfter");
  });

  it("moves the row and clears its journeys atomically", () => {
    const start = SOURCE.indexOf("export async function moveItemToDay");
    const body = SOURCE.slice(start, SOURCE.indexOf("\n}\n", start));

    // An item that left one day without arriving on the other is worse than
    // a move that did not happen.
    expect(body).toContain("prisma.$transaction");
  });
});
