import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Guards on the auth wiring itself.
 *
 * Sessions cannot be exercised here — cookies need a request scope, and the
 * database is not available. These assert the properties that would be
 * catastrophic to get wrong and that are visible in the source: that the
 * local-owner fallback cannot apply once a database exists, and that every
 * trip route still goes through `requireUser`.
 */

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("the local owner fallback", () => {
  const source = read("src/lib/auth.ts");

  it("applies only when there is no database", () => {
    // If this ever returns LOCAL_OWNER after a session lookup fails, anyone
    // reaches a real user's trips by not signing in.
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    const returns = [...withoutComments.matchAll(/return LOCAL_OWNER/g)];
    expect(returns).toHaveLength(1);
    expect(withoutComments).toMatch(/if \(!prisma\) return LOCAL_OWNER/);
  });

  it("reads a session before returning any user when a database exists", () => {
    // Compared inside the function body, not against the import line.
    const body = source.slice(source.indexOf("export async function getCurrentUser"));
    const prismaIndex = body.indexOf("getPrisma()");
    const sessionIndex = body.indexOf("await readSessionUserId()");
    expect(prismaIndex).toBeGreaterThan(-1);
    expect(sessionIndex).toBeGreaterThan(prismaIndex);
  });

  it("still throws when there is no user", () => {
    expect(source).toMatch(/if \(!user\) throw unauthorized\(\)/);
  });
});

describe("route protection", () => {
  const routes = [
    "src/app/api/trips/route.ts",
    "src/app/api/trips/[tripId]/route.ts",
    "src/app/api/trips/[tripId]/generate/route.ts",
    "src/app/api/trips/[tripId]/optimize/route.ts",
    "src/app/api/trips/[tripId]/validate/route.ts",
    "src/app/api/trips/[tripId]/budget/route.ts",
    "src/app/api/trips/[tripId]/transportation/route.ts",
    "src/app/api/trips/[tripId]/chat/route.ts",
    "src/app/api/trips/[tripId]/itinerary/route.ts",
    "src/app/api/trips/[tripId]/itinerary/[itemId]/route.ts",
  ];

  it.each(routes)("%s calls requireUser", (route) => {
    expect(read(route)).toContain("requireUser()");
  });

  it("guards the authenticated layout", () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toContain("getCurrentUser");
    expect(layout).toMatch(/redirect\("\/sign-in"\)/);
  });
});

describe("the session cookie", () => {
  const source = read("src/lib/auth/session.ts");

  it("is httpOnly, so script cannot read it", () => {
    expect(source).toMatch(/httpOnly: true/);
  });

  it("is sameSite lax, so a cross-site post cannot use it", () => {
    expect(source).toMatch(/sameSite: "lax"/);
  });

  it("is secure in production", () => {
    expect(source).toMatch(/secure: env\(\)\.NODE_ENV === "production"/);
  });

  it("refuses to sign with a weak secret", () => {
    expect(source).toMatch(/value\.length < 16/);
  });
});

describe("sign-in does not leak which accounts exist", () => {
  const source = read("src/app/(auth)/actions.ts");

  it("gives one message for a wrong password and a missing account", () => {
    expect(source).toContain("BAD_CREDENTIALS");
    // Two distinct messages here would be an account enumerator.
    const matches = [...source.matchAll(/message: BAD_CREDENTIALS/g)];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("hashes even when the account does not exist", () => {
    // Otherwise the response time answers "is this email registered?".
    expect(source).toMatch(/user\?\.passwordHash \?\?/);
  });
});
