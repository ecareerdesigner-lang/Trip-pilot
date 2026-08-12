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

Phases 1-2 (foundation, docs, seed), 11 (trip wizard), 12 (trip CRUD), 13
(mock providers), 14 (AI planner), 15 (itinerary view), 16 (transportation),
17 (budget) and 18 (reality check) are complete. See
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
- **The wizard does not use `zodResolver`.** The schema carries cross-field
  rules that only validate against the whole form, but each step must be
  checkable alone. `TripWizard.validateStep` parses everything and surfaces
  only the issues owned by the current step. Do not "simplify" this into a
  resolver without solving that.
- **`STEP_FIELDS` must list every form field exactly once.** A field missing
  from it is never validated. A test enforces this.
- **Absent data means a check is skipped, never that it passed.** Opening
  hours are not stored on itinerary items, so `validateItinerary` only runs
  the closing-time checks for items whose hours the caller supplies. Never
  make a check quietly succeed because its input was missing.
- **Edits are pure; persistence is a wrapper.** Every mutation lives in
  `travel/edit-itinerary.ts` as a function from a day to a new day, with 30
  tests. `editDay` in the repository only reads, delegates and writes. Add new
  edit operations there, not in the repository.
- **Every edit reroutes.** Moving, resizing or removing an item recomputes the
  journeys into the items around it, using the same backwards-from-arrival
  rule as the plan builder. An edit path that skips `recomputeLegs` will
  produce exactly the impossible schedules Phase 19 spent three rounds fixing.
- **The local-owner fallback applies only with no database.** `getCurrentUser`
  returns `LOCAL_OWNER` when `getPrisma()` is null and never otherwise — a
  second `return LOCAL_OWNER` would let anyone reach a real user's trips by
  not signing in. `auth/guard.test.ts` asserts there is exactly one.
- **Sign-in must not reveal which emails are registered.** One message for a
  wrong password and a missing account, and a hash is computed even when the
  account does not exist so the response time does not answer the question.
- **Passwords use Node's scrypt, no third-party dependency.** Hashes are
  self-describing (`scrypt$N$r$p$salt$hash`) so cost can be raised later
  without invalidating existing passwords.
- **Data-driven paint needs `to-color`.** `["get", "color"]` yields a string;
  MapLibre cannot use it as paint and silently falls back to black. Wrap it:
  `["to-color", ["get", "color"]]`. There is no console warning for this.
- **`mock/audit.test.ts` bounds generated coordinates tightly.** The older
  provider test allowed a 35km radius from the city centre, which is wide
  enough to put a Manhattan restaurant in Jersey City. The audit asserts each
  place sits within scatter range of its own neighbourhood, that NYC places
  fall inside a five-borough box, and that no two collide on a map.
- **MapLibre is pinned to 5.x on purpose.** Version 6 loads its worker as a
  separate `.mjs` module; Turbopack emits it under `/static/media/`, the
  request 404s, and the dev server returns HTML — which the browser rejects
  with "non-JavaScript MIME type". Markers rendered, layers never did. Version
  5 inlines the worker as a blob. Do not upgrade without checking that
  `find .next/static -name "*maplibre*"` returns nothing.
- **"Failed to load module script … text/html" means a chunk 404'd**, not a
  styling bug. Check the Network tab before touching map layer config.
- **Memoize anything an effect depends on.** `buildMapData` ran unmemoized,
  so every render produced fresh arrays, the map effects re-fired
  continuously, and the route layers were added and torn down faster than
  they could draw — markers appeared, lines never did. Sources and layers are
  now created once inside `on("load")`; effects only call `setData`.
- **Do not pad twice.** `map-data.ts` already pads its bounding box.
  `fitBounds` adding a generous second margin zoomed a Manhattan trip out far
  enough to include Secaucus.
- **The map uses MapLibre with OpenStreetMap raster tiles — no key needed.**
  `trip-map-libre.tsx` is client-only (`next/dynamic`, MapLibre touches
  `window` on import). MapLibre 6 has named exports and no default. Swapping
  to Mapbox vector tiles is a change to `TILE_STYLE` alone.
- **`trip-map.tsx` is the keyless SVG fallback**, kept because it renders
  without tiles at all. It is not currently mounted; the real basemap replaced
  it after a review found stops on a blank grid unreadable.
- **The map layer has no mapping vendor.** `travel/map-data.ts` produces markers,
  routes and a Mercator projection in plain coordinates; `trip-map.tsx` draws
  them as SVG. It works with no API key. A basemap can be layered behind it
  later without either file learning what Mapbox is.
- **Trust upstream error messages.** The client used to append "this usually
  means ANTHROPIC_MODEL needs setting" to every 400 — including one that
  plainly said the account was out of credit. When an API explains itself,
  pass that through rather than guessing over it.
- **Chat proposes; the traveler approves.** The model returns commands from a
  fixed vocabulary, never an itinerary. `POST .../chat` without `commands`
  proposes and touches nothing; with `commands` it applies what was approved.
  Do not collapse these into one call — a misread request should cost a click,
  not somebody's Thursday.
- **Chat commands run through the same edit helpers as the UI.**
  `applyChatCommands` calls `addItineraryItem` / `updateItineraryItem` /
  `removeItineraryItem`, so transportation and conflicts recalculate
  identically whichever way a change was made. Never write item rows directly
  from the chat path.
- **Decisions inside Prisma queries cannot be tested here.** The rule for
  what survives a regeneration lived in a `deleteMany` filter and was wrong
  for three releases: `MUST_DO` was preserved, so every rebuild stacked
  another copy of the same place on the same day. It now lives in
  `travel/rebuild-policy.ts` as pure functions with exhaustive tests, and the
  query imports from it. Put any similar rule in a pure module first.
- **A bug that needs two runs to appear will not show in one run.** The
  duplicate stacking only existed after regenerating an already-generated
  trip. Single-pass tests cannot see it. When a fix touches persistence, ask
  what the second invocation does.
- **The planner's buffer comes from `PACE_BUFFER_MINUTES`.** It used a flat
  ten minutes while the validator judged against twenty-five, so the planner
  generated warnings about its own output. `christmas.test.ts` asserts no
  self-inflicted TIGHT_CONNECTION or OVERLAP.
- **Reproduce with a real trip before fixing.** Three defects survived 362
  passing tests because `pipeline.test.ts` ran a trip with no must-dos and no
  supply pressure. `christmas.test.ts` pins the exact trip that broke twice —
  five days, NYC, must-dos that match nothing. Add a case there when a real
  run finds something, and watch it fail before writing the fix.
- **A finite queue must not be consumed by near-misses.** `takeFitting` scans
  the pending list and removes only what it schedules. An earlier version
  advanced an index whenever a candidate did not fit, discarding it forever,
  so days one and two drained the queue and days three to five had nothing
  but meals.
- **The planner must ask the router, never assume a gap.** An earlier version
  spaced items by a flat 35 minutes; the router said 37, and the reality-check
  engine condemned schedules the planner had just produced. Every place that
  decides when the next item starts calls `hopMinutes`. `pipeline.test.ts`
  asserts a generated itinerary passes its own validator — if you add a new
  scheduling path, it must go through `hopMinutes` or that test will fail.
- **Check the tree before building a phase.** Some phases already exist on
  disk from earlier sessions, with their own tests and naming. Run
  `npm run check` and grep for the engine first; building a parallel copy
  creates two versions of the same concept (this happened with journeys.ts
  and transportation.ts — the duplicate was deleted).
- **Planned spend is derived, never stored on its own.** `getTripBudget`
  recomputes the ledger from the schedule with `ledgerFromDays` on every read.
  Only `actualCents` is carried from the database. Do not add a second place
  that writes planned totals — it will drift.
- **View model names are `Timeline*` / `ItineraryDay`.** An older `*View`
  naming was consolidated away. If both appear, one is stale — do not
  reintroduce the second set.
- **The planner selects; it never supplies facts.** The model returns
  candidate ids. `plan-builder.ts` re-reads the name, price, coordinates and
  opening hours from the candidate, so a renamed museum or an invented fare
  cannot reach the itinerary. An unknown id is dropped and reported. Do not
  "trust" a field the model returned just because it looks right.
- **A stay is charged once.** Check-in, check-out and evening returns are all
  LODGING items on the same hotel. `chargedStays` in the plan builder exists
  because billing each of them multiplied the largest budget line by the
  length of the trip.
- **Pure engines must not import `@/lib/env`.** It imports `server-only`,
  which throws under Vitest. That is why `planRoute` lives in
  `travel/routing.ts` and `providers/transit.ts` is only a thin wrapper. If a
  test fails with "cannot be imported from a Client Component module", the
  layering is wrong — move the pure part out rather than reaching for the
  stub. `server-only` is aliased in `vitest.config.mts` for modules that
  genuinely need config, such as the providers.
- **Travel times are never constants.** Every duration is a distance from
  `lib/geo.ts` divided by a speed in `travel/routing.ts`. Do not add a lookup
  table of journey times; move a coordinate instead.
- **`loading.tsx` breaks `notFound()` status codes.** A loading file wraps
  its own segment and everything beneath it in Suspense, which streams the
  response — so the 200 is already sent by the time a page calls
  `notFound()`, and the 404 never lands. Never put `loading.tsx` on a segment
  with dynamic children. Wrap the slow part in `<Suspense>` inside the page
  instead. This cost a real debugging session; verify status codes with curl,
  not by looking at the rendered page, because the correct not-found page
  renders either way.
- **Zod needs explicit messages for missing fields.** `z.string().min(2, {...})`
  only covers a present-but-short value. A field that is absent entirely
  produces "expected string, received undefined" unless
  `z.string({ message })` is given too.
- **The generated Prisma client is required for model types.** Before
  `npm run db:generate`, `PrismaClient` resolves but `prisma.trip` does not
  exist. `getPrisma()` returns `null` rather than throwing.
