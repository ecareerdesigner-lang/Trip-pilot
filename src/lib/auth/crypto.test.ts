import { describe, it, expect } from "vitest";
import {
  hashPassword,
  needsRehash,
  sessionExpiry,
  signSession,
  verifyPassword,
  verifySession,
} from "@/lib/auth/crypto";

const SECRET = "test-secret-not-used-anywhere-real";

describe("hashPassword", () => {
  it("produces a self-describing hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const parts = hash.split("$");
    expect(parts[0]).toBe("scrypt");
    expect(parts).toHaveLength(6);
  });

  it("never stores the password itself", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toContain("hunter2");
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery stapl", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("is case sensitive", async () => {
    const hash = await hashPassword("Password");
    expect(await verifyPassword("password", hash)).toBe(false);
  });

  it("handles unicode consistently", async () => {
    // The same string composed two ways must match, or a password typed on a
    // Mac fails on Windows.
    const composed = "café";
    const decomposed = "cafe\u0301";
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it("accepts a very long password", async () => {
    const long = "x".repeat(500);
    expect(await verifyPassword(long, await hashPassword(long))).toBe(true);
  });

  it("fails closed on a malformed hash rather than throwing", async () => {
    for (const bad of [
      "",
      "not-a-hash",
      "scrypt$1$2$3",
      "bcrypt$16384$8$1$aa$bb",
      "scrypt$x$8$1$aa$bb",
      "scrypt$16384$8$1$$",
    ]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });

  it("does not accept an empty stored hash for an empty password", async () => {
    expect(await verifyPassword("", "")).toBe(false);
  });
});

describe("needsRehash", () => {
  it("flags a hash made with weaker parameters", () => {
    expect(needsRehash("scrypt$1024$8$1$aabb$ccdd")).toBe(true);
  });

  it("leaves a current hash alone", async () => {
    expect(needsRehash(await hashPassword("current"))).toBe(false);
  });

  it("flags anything it does not recognise", () => {
    expect(needsRehash("bcrypt$whatever")).toBe(true);
    expect(needsRehash("")).toBe(true);
  });
});

describe("signSession / verifySession", () => {
  const now = 1_800_000_000;

  it("round-trips a valid session", () => {
    const token = signSession({ userId: "user-1", expiresAt: now + 100 }, SECRET);
    const payload = verifySession(token, SECRET, now);
    expect(payload?.userId).toBe("user-1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession({ userId: "user-1", expiresAt: now + 100 }, SECRET);
    expect(verifySession(token, "another-secret", now)).toBeNull();
  });

  it("rejects a tampered user id", () => {
    const token = signSession({ userId: "user-1", expiresAt: now + 100 }, SECRET);
    const forged = token.replace("user-1", "user-2");
    expect(verifySession(forged, SECRET, now)).toBeNull();
  });

  it("rejects an extended expiry", () => {
    // The whole point: a user cannot grant themselves a longer session.
    const token = signSession({ userId: "user-1", expiresAt: now + 100 }, SECRET);
    const parts = token.split(".");
    const forged = `${parts[0]}.${now + 999_999}.${parts[2]}`;
    expect(verifySession(forged, SECRET, now)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSession({ userId: "user-1", expiresAt: now - 1 }, SECRET);
    expect(verifySession(token, SECRET, now)).toBeNull();
  });

  it("rejects a token expiring exactly now", () => {
    const token = signSession({ userId: "user-1", expiresAt: now }, SECRET);
    expect(verifySession(token, SECRET, now)).toBeNull();
  });

  it("rejects malformed tokens without throwing", () => {
    for (const bad of [
      "",
      "onlyonepart",
      "two.parts",
      "a.b.c.d",
      ".100.signature",
      "user.notanumber.signature",
      "user.100.",
    ]) {
      expect(verifySession(bad, SECRET, now)).toBeNull();
    }
  });

  it("does not leak anything secret in the token", () => {
    const token = signSession({ userId: "user-1", expiresAt: now + 100 }, SECRET);
    expect(token).not.toContain(SECRET);
  });
});

describe("sessionExpiry", () => {
  it("is thirty days out", () => {
    const now = 1_800_000_000;
    expect(sessionExpiry(now) - now).toBe(30 * 24 * 60 * 60);
  });
});
