# Security

What has been reviewed, what was found, and what is still open.

## Model

One user owns their trips and nothing else. There is no sharing, no admin
role, and no multi-tenancy beyond that. The threats worth defending against
are: reaching another user's trips, reaching any trip without signing in,
extracting which email addresses have accounts, and running up cost or load
from a browser tab.

## Controls

**Authentication.** Email and password. Passwords are hashed with Node's
scrypt (N=16384, r=8, p=1), salted per password, in a self-describing format
so cost can be raised later without invalidating existing hashes. Sessions are
HMAC-SHA256 tokens in an httpOnly, sameSite-lax cookie, secure in production,
expiring after 30 days.

**Authorization.** Every route handler calls `requireUser()`. Every
trip-scoped query filters on `userId` in the `where` clause rather than
checking ownership after loading, so a wrong id returns nothing rather than
someone else's trip. `assertOwnsTrip()` reports a mismatch as unauthorized
rather than forbidden, so probing ids cannot confirm a trip exists.

**Input.** Every request body is parsed with Zod at the boundary. Nothing is
read from an unparsed body.

**Errors.** Everything thrown goes through `toErrorBody()`, which logs the
detail server-side under a trace id and returns a safe message plus that id.
No stack traces, no provider payloads, no environment values.

**Secrets.** Server-side only, enforced by `server-only` on `env`, `db`,
`auth`, `session` and the AI client — a stray client import fails the build.
The logger redacts any context key matching key/token/secret/password/auth/
cookie. The only client-exposed value is a Mapbox public token, which is
designed to be public and is currently unused.

**Rate limiting.** Generation, chat and optimization go through a shared
limiter. The first two call an external model; optimization does not, but it
routes every pair of stops on every day, which is a way to pin a core.

**Headers.** CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy`. `X-Powered-By` is off.

## Found in review

Five issues, all fixed:

1. **Unbounded location growth.** `saveGeneratedItinerary` created a new
   `Location` row for every place on every regeneration — the comment claimed
   an upsert, the code did not. Driven by a button anyone can press
   repeatedly. Now reuses an existing row by provider reference, or by name
   and coordinates.

2. **A helper that could mint a passwordless account.** `ensureLocalUser`
   upserted a user row before creating a trip, from the era before sign-up.
   Harmless then; a way in afterwards. Removed rather than left unused.

3. **Optimization was not rate limited.** Now is.

4. **Chat history was trusted.** The client sends the conversation back on
   every request, so a caller could claim the assistant had already agreed to
   something, and 20 turns × 2000 characters was 40KB of attacker-controlled
   prompt per request. Now capped at 6 × 600, flattened so newlines cannot
   impersonate the prompt's own headings, and labelled as unverified. The
   real protection remains downstream: the model returns commands from a
   fixed vocabulary, screened against the trip's real items and dates, and
   the traveler approves them before anything is applied.

5. **No Content-Security-Policy.** Added, with `connect-src` limited to self,
   the Anthropic API and the tile host.

## Found after review

**Malformed trip ids crashed the page.** Ids come from the URL and the `id`
columns are `@db.Uuid`, so Postgres rejected anything that was not a uuid
before the query ran — surfacing as a 500 with a stack trace rather than a
404. Now validated in every trip-scoped repository function. The dashboard
also stopped showing sample trips to signed-in travelers, since those carry
ids like `sample-nyc` that cannot exist.

## Open

**Rate limiting is per-process and in memory.** Correct for one instance,
wrong behind more than one. `RateLimiter` is an interface; implement it
against Redis before running multi-instance. No call site changes.

**Sessions are stateless.** There is no way to sign out everywhere or revoke
a token before it expires. A server-side session table would fix it and is
the natural next step if this becomes multi-user in earnest.

**No password reset.** No email is sent anywhere, so a forgotten password
means a database edit.

**No CSRF token.** Mitigated by sameSite-lax cookies, which block the
cross-site form post that CSRF depends on. Worth adding a token if the cookie
policy ever loosens.

**CSP allows `unsafe-inline` and `unsafe-eval` for scripts.** Required by
Next's dev overlay and by MapLibre, which compiles style expressions at
runtime. Tightening means nonce-based script tags, which is a real change
rather than a config line.

**No account lockout.** Repeated failed sign-ins are logged but not throttled.
The scrypt cost makes online guessing slow; a lockout or per-IP limit would
be better.

**Provider data is rendered as HTML in map popups.** Escaped by hand in
`popupHtml`. It is sample data today; a live provider makes this a real
untrusted-input path worth revisiting.
