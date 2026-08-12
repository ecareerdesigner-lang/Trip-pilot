import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * Password hashing and session tokens.
 *
 * Node's own scrypt rather than bcrypt or argon2: it is a memory-hard KDF
 * built into the runtime, needs no native module, and there is no build step
 * to break on Windows. One less dependency in the part of the codebase where
 * a supply-chain problem matters most.
 *
 * Pure and dependency-free, so every property below is unit tested — a
 * password check that silently always returns true is the kind of bug that
 * cannot be found by looking at the screen.
 */

/**
 * `promisify` resolves to the three-argument overload, which loses the cost
 * parameters, so the wrapper is written out.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Cost parameters.
 *
 * N=16384 takes roughly 50ms per hash on a modern laptop: slow enough to make
 * offline guessing expensive, fast enough that signing in feels immediate.
 * Stored alongside each hash so these can be raised later without
 * invalidating existing passwords.
 */
const SCRYPT = { N: 16_384, r: 8, p: 1, keyLength: 64 } as const;
const SALT_BYTES = 16;

/** `scrypt$N$r$p$salt$hash`, all hex. Self-describing so it can be upgraded. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(
    password.normalize("NFKC"),
    salt,
    SCRYPT.keyLength,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
  );

  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/**
 * Check a password against a stored hash.
 *
 * Returns false for anything malformed rather than throwing: a corrupt row
 * must fail closed, not crash the sign-in route and reveal that the row
 * exists.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "hex");
    expected = Buffer.from(parts[5]!, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
    });
  } catch {
    return false;
  }

  // Constant time: a fast rejection tells an attacker how many bytes matched.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** True when a hash was made with weaker parameters than current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < SCRYPT.N;
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

export interface SessionPayload {
  userId: string;
  /** Unix seconds. */
  expiresAt: number;
}

/**
 * A signed token: `userId.expiresAt.signature`.
 *
 * HMAC-SHA256 over the payload with AUTH_SECRET. Stateless, so signing out
 * everywhere is not possible without a server-side store — acceptable for a
 * personal-first app, and the shape leaves room to add one later.
 *
 * The value never contains anything secret. Its only job is to be
 * unforgeable, so a tampered user id is rejected.
 */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = `${payload.userId}.${payload.expiresAt}`;
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verify and decode a token.
 *
 * Null for anything invalid: wrong signature, malformed, or expired. The
 * caller cannot tell which, and should not — a token that is merely expired
 * and one that was forged both mean "not signed in".
 */
export function verifySession(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresRaw, signature] = parts as [string, string, string];
  if (userId.length === 0) return null;

  const expiresAt = Number(expiresRaw);
  if (!Number.isInteger(expiresAt)) return null;

  const expected = sign(`${userId}.${expiresRaw}`, secret);

  // Compared in constant time, and only after the lengths match, since
  // timingSafeEqual throws on a length mismatch.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  if (expiresAt <= nowSeconds) return null;

  return { userId, expiresAt };
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Session lifetime. Long enough not to nag, short enough to matter. */
export const SESSION_DAYS = 30;

export function sessionExpiry(
  nowSeconds: number = Math.floor(Date.now() / 1000),
): number {
  return nowSeconds + SESSION_DAYS * 24 * 60 * 60;
}
