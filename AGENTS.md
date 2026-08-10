# AGENTS.md

Instructions for Claude Code sessions working on TripPilot AI.

Read this before writing code. It records decisions that are already settled,
so you do not re-litigate them or quietly contradict them.

## What this product is

An AI travel planner that treats **transportation as part of the itinerary**.
The walk to the subway, the subway ride, and the walk from the station are
scheduled legs with their own times and costs — not footnotes under the
museum. If a change you make would let an itinerary teleport the traveler
between two places, the change is wrong.

Personal-first, architected to become SaaS. Single local owner today, real
sessions in Phase 22.

## Build phase

Phase 1 (foundation) and Phase 2 (docs + seed) are complete. See
`docs/development.md` for the full 27-phase order and what remains.

Do not jump ahead. Each phase ends with typecheck, lint, tests and — where it
applies — a production build, all passing. Never leave the project knowingly
broken between phases.

## Non-negotiable conventions

### Money is integer cents

Every currency value is an `Int` named `*Cents`. No floats, no `Decimal`,
anywhere, ever.

Two reasons: float arithmetic puts stray pennies in budget totals and flips
the sign of small variances, and Prisma's `Decimal` does not serialize across
the React Server Component boundary without a manual conversion at every
call site.

Use `src/lib/money.ts`. `allocateCents` splits a total by weight while
preserving the exact sum — use it for budget allocation rather than
multiplying by percentages.

### Geography lives in `Location`

`ItineraryItem`, `TransportationLeg`, `HotelOption`, `RestaurantOption`,
`ActivityOption` and `TransportationOption` all reference `Location` by id.
None of them carry their own `latitude`/`longitude`.

The original spec listed `location`, `latitude` and `longitude` directly on
`ItineraryItem`. That was deliberately normalized away — the same spec forbids
duplicated data, and a place that appears on three days would otherwise have
three copies of its coordinates that can drift apart.

### Domain enums are mirrored by hand

`src/types/domain.ts` restates every Prisma enum as a `const` array plus a
derived union type. Engines and UI import from there, never from
`@prisma/client`.

This keeps the planning engines (validation, optimization, budget) compilable
and testable without a generated client or a database, and keeps a server-only
package out of the client bundle.

`src/lib/schema-parity.test.ts` parses `prisma/schema.prisma` and fails if the
two drift. **When you add or change an enum, change both** — the test will
catch you, but fix it properly rather than editing the test.

### Mock data is always labelled

A provider stays on mock until both its mode *and* its credential are set —
see `providerMode()` in `src/lib/env.ts`. A half-configured provider must
never silently look live.

Mock-sourced rows carry `isMock: true`. The UI surfaces it through
`DataSourceNote`. Never present sample flights, hotel rates, restaurant
availability or transit schedules as real.

Routes that exist before their feature does render `NotBuiltYet`, naming the
phase that will fill them in. A screen that looks finished but does nothing is
worse than no screen.

### Auth runs through one seam

Every trip-scoped operation calls `requireUser()` and then
`assertOwnsTrip()` from `src/lib/auth.ts`. Both, every time, from day one.

Ownership failures report as unauthorized rather than not-found-vs-forbidden,
so probing UUIDs cannot confirm another user's trip exists.

Phase 22 replaces the body of `getCurrentUser()` with real session reading.
If call sites are correct now, that is a one-file change.

### Errors never leak

Throw `AppError` from `src/lib/errors.ts`. Route handlers convert with
`toErrorBody()`, which logs the full error server-side under a trace id and
returns only a safe message plus that id.

No stack traces, no provider payloads, no environment values in responses. The
logger redacts any context key matching key/token/secret/password/auth/cookie.

### Dates

Trip dates are calendar dates stored as `@db.Date` and formatted in UTC. A
trip starting on the 4th starts on the 4th regardless of who is looking at it.
Itinerary times are real instants (`DateTime`) and belong to the destination's
timezone.

Do not use `new Date(string)` on a bare `YYYY-MM-DD` and then read local
getters — that shifts the day backwards west of UTC. Use the helpers in
`src/lib/format.ts`.

## Working style

- **Complete files, not diffs.** The owner works in VS Code on Windows and
  pastes whole files. Do not emit partial patches or `// ... rest unchanged`.
- **PowerShell, not bash.** Commands go to `PS C:\Users\philz\trip-pilot>`.
  `cp` is not a thing; use `Copy-Item`.
- **Keep business logic out of components.** Engines under `src/lib/travel/`
  are pure functions over plain objects — no Prisma, no React, no fetch. That
  is what makes them testable.
- **One file, one job.** Do not put the application in a small number of large
  files.
- **Explain architecture changes before making them.** Routine implementation
  proceeds without asking.

## Verify before claiming done

```powershell
npm run check     # typecheck + lint + test
npm run build     # production build
```

`npm run check` must be clean before you report a phase complete. If you could
not run something, say so plainly rather than implying you did.

## Environment notes

- Node 20.9+ (developed on 22.x). Next 16, React 19, Tailwind 4, Prisma 6,
  Zod 4, ESLint 9.
- Local PostgreSQL 17 at `localhost:5432`, database `trippilot`.
- `prisma.config.ts` imports `dotenv/config` first. A Prisma config file
  disables the CLI's automatic `.env` loading, so removing that import makes
  every `prisma` command stop seeing `DATABASE_URL`.
- The app runs with no database at all — the repository layer falls back to
  the labelled sample dataset in `src/lib/sample-trips.ts`.

## Traps already hit

Do not rediscover these.

- **`@import url()` must come before `@import "tailwindcss"`** in
  `globals.css`. CSS requires every `@import` to precede other rules.
- **Intl has no day+year-only date format.** Asking for `{ day, year }`
  produces `"2026 (day: 9)"`. `formatDateRange` builds that half manually.
- **`noUncheckedIndexedAccess` is on.** Array access yields `T | undefined`.
  Handle it; do not reach for `!`.
- **The generated Prisma client is required for model types.** Before
  `npm run db:generate`, `PrismaClient` resolves but `prisma.trip` does not
  exist. `getPrisma()` returns `null` rather than throwing.
