import { describe, it, expect } from "vitest";
import { isUuid } from "@/lib/ids";

describe("isUuid", () => {
  it("accepts a real trip id", () => {
    expect(isUuid("40b6b770-933d-484d-9a20-acc02e4ce1c1")).toBe(true);
    expect(isUuid("bfd6a02e-66f6-4ecd-a229-b25e197c8e3d")).toBe(true);
  });

  it("accepts the local owner id", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
  });

  it("is case insensitive and tolerates surrounding space", () => {
    expect(isUuid("40B6B770-933D-484D-9A20-ACC02E4CE1C1")).toBe(true);
    expect(isUuid("  40b6b770-933d-484d-9a20-acc02e4ce1c1  ")).toBe(true);
  });

  it("rejects the sample ids that crashed the trip page", () => {
    // Postgres rejects these before the query runs, so they reached the user
    // as a 500 rather than a 404.
    for (const id of ["sample-nyc", "sample-chi", "sample-par", "sample-dc"]) {
      expect(isUuid(id)).toBe(false);
    }
  });

  it("rejects anything else somebody might type into the address bar", () => {
    for (const bad of [
      "",
      "   ",
      "1",
      "not-a-uuid",
      "40b6b770-933d-484d-9a20",
      "40b6b770-933d-484d-9a20-acc02e4ce1c1x",
      "40b6b770933d484d9a20acc02e4ce1c1",
      "../../etc/passwd",
      "'; drop table trips; --",
    ]) {
      expect(isUuid(bad), `${bad} should be rejected`).toBe(false);
    }
  });

  it("rejects a version that Prisma does not generate", () => {
    // Prisma's uuid() is v4; a v6 string is well-formed but not ours.
    expect(isUuid("40b6b770-933d-684d-9a20-acc02e4ce1c1")).toBe(false);
  });
});
