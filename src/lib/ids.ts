/**
 * Identifier checks.
 *
 * Trip ids arrive from URLs, so they are untrusted input. The `id` columns
 * are `@db.Uuid`, and Postgres rejects a malformed value at the type level
 * before any query runs — which surfaces as a 500 and a stack trace rather
 * than the 404 it should be.
 *
 * Checking here means a bad id is simply an id that matches nothing.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value.trim());
}
