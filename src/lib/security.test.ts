import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Security review, as tests.
 *
 * Each of these corresponds to something found by reading the code rather
 * than by using the app. Written down so a later change cannot quietly undo
 * them — several of these were introduced by a refactor that looked harmless.
 */

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

function findRoutes(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(process.cwd(), dir))) {
    const relative = path.join(dir, entry);
    if (statSync(path.join(process.cwd(), relative)).isDirectory()) {
      findRoutes(relative, found);
    } else if (entry === "route.ts") {
      found.push(relative);
    }
  }
  return found;
}

const ROUTES = findRoutes("src/app/api");

describe("every API route is guarded", () => {
  it("finds the routes", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(ROUTES)("%s authenticates", (route) => {
    expect(read(route)).toContain("requireUser()");
  });

  it.each(ROUTES)("%s converts errors safely", (route) => {
    // Anything thrown must go through toErrorBody, which strips stack traces
    // and returns a trace id instead.
    expect(read(route)).toContain("toErrorBody");
  });

  it.each(ROUTES)("%s does not return a raw error", (route) => {
    const source = read(route);
    expect(source).not.toMatch(/json\(\{\s*error:\s*error/);
    expect(source).not.toMatch(/error\.stack/);
  });
});

describe("expensive routes are rate limited", () => {
  const EXPENSIVE = [
    "src/app/api/trips/[tripId]/generate/route.ts",
    "src/app/api/trips/[tripId]/chat/route.ts",
    // Not an AI call, but it routes every pair of stops on every day.
    "src/app/api/trips/[tripId]/optimize/route.ts",
  ];

  it.each(EXPENSIVE)("%s checks the limiter", (route) => {
    expect(read(route)).toContain("aiRateLimiter()");
  });
});

describe("no path can mint an account", () => {
  it("has no helper that creates a user outside sign-up", () => {
    // `ensureLocalUser` upserted a user row with no password hash. Harmless
    // while there was no auth; a way in once there was.
    const repository = read("src/lib/repositories/trips.ts");
    expect(repository).not.toContain("prisma.user.upsert");
    expect(repository).not.toContain("prisma.user.create");
  });

  it("creates users only in the sign-up action", () => {
    const actions = read("src/app/(auth)/actions.ts");
    expect(actions).toContain("prisma.user.create");
    expect(actions).toContain("hashPassword");
  });

  it("never stores a password that was not hashed", () => {
    const actions = read("src/app/(auth)/actions.ts");
    expect(actions).not.toMatch(/passwordHash:\s*parsed\.data\.password/);
  });
});

describe("regenerating does not grow the database without bound", () => {
  it("reuses locations instead of creating one per run", () => {
    // Every regeneration used to leave another copy of every place behind,
    // driven by a button anyone can press repeatedly.
    const source = read("src/lib/repositories/trips.ts");
    const saveStart = source.indexOf("saveGeneratedItinerary");
    const body = source.slice(saveStart);
    expect(body).toContain("prisma.location.findFirst");
  });
});

describe("client-supplied chat history is treated as untrusted", () => {
  it("is capped so it cannot become a large prompt", () => {
    const route = read("src/app/api/trips/[tripId]/chat/route.ts");
    expect(route).toMatch(/\.max\(6\)/);
    expect(route).toMatch(/max\(600\)/);
  });

  it("is flattened before it enters the prompt", () => {
    // Newlines are what let injected text impersonate the prompt's own
    // section headings.
    const prompt = read("src/lib/ai/chat-prompt.ts");
    expect(prompt).toContain("sanitizeTurn");
    expect(prompt).toMatch(/not verified/i);
  });
});

describe("security headers", () => {
  const config = read("next.config.ts");

  it("sets a content security policy", () => {
    expect(config).toContain("Content-Security-Policy");
  });

  it("restricts where data may be sent", () => {
    // The header that stops a compromised dependency posting trip data or a
    // session cookie to an arbitrary host.
    expect(config).toMatch(/connect-src 'self'/);
  });

  it("forbids framing and object embedding", () => {
    expect(config).toMatch(/frame-ancestors 'none'/);
    expect(config).toMatch(/object-src 'none'/);
  });

  it("does not advertise the framework", () => {
    expect(config).toContain("poweredByHeader: false");
  });
});

describe("secrets stay on the server", () => {
  it("keeps the Anthropic key out of anything public", () => {
    const env = read("src/lib/env.ts");
    expect(env).not.toMatch(/NEXT_PUBLIC_ANTHROPIC/);
  });

  it("guards server-only modules", () => {
    for (const serverModule of [
      "src/lib/env.ts",
      "src/lib/db.ts",
      "src/lib/auth.ts",
      "src/lib/auth/session.ts",
      "src/lib/ai/client.ts",
    ]) {
      expect(read(serverModule), `${serverModule} is missing server-only`).toContain(
        'import "server-only"',
      );
    }
  });

  it("redacts secret-looking keys from logs", () => {
    const logger = read("src/lib/logger.ts");
    expect(logger).toMatch(/key\|token\|secret\|password/);
  });
});

describe("the Anthropic key is handled carefully", () => {
  const source = read("src/lib/ai/client.ts");

  it("is trimmed before use", () => {
    // A trailing newline from an editor is a 401 that looks exactly like a
    // revoked key.
    expect(source).toMatch(/ANTHROPIC_API_KEY \?\? ""\)\.trim\(\)/);
  });

  it("checks the shape before sending it", () => {
    expect(source).toContain('startsWith("sk-ant-")');
  });

  it("never logs the key or the response body wholesale", () => {
    expect(source).not.toMatch(/logger\.\w+\([^)]*apiKey/);
    expect(source).not.toMatch(/logger\.\w+\([^)]*ANTHROPIC_API_KEY/);
  });
});
