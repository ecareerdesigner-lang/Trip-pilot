# Architecture

## The idea in one paragraph

Most trip planners produce a list of recommendations and leave the traveler to
work out how the day actually fits together. TripPilot produces a schedule in
which getting between places is itself scheduled. A day is a sequence of stops
connected by legs, each leg with a mode, a duration and a cost, and the whole
thing is checked against reality before it is shown.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│  app/            Routes, pages, server actions, route handlers│
│                  Rendering and request handling only          │
├──────────────────────────────────────────────────────────────┤
│  components/     Presentation. No fetching, no business logic │
├──────────────────────────────────────────────────────────────┤
│  lib/repositories/   The only place that touches Prisma       │
├──────────────────────────────────────────────────────────────┤
│  lib/travel/     Pure engines: validate, optimize, budget     │
│  lib/ai/         Planning prompts and structured-output parse │
├──────────────────────────────────────────────────────────────┤
│  lib/providers/  Interfaces + mock and live implementations   │
├──────────────────────────────────────────────────────────────┤
│  lib/            env, errors, logger, auth, money, format     │
│  types/          Domain enums, view models                    │
└──────────────────────────────────────────────────────────────┘
```

Dependencies point downward only. A pure engine must never import a
repository; a component must never import Prisma.

## Why the engines are pure

`lib/travel/*` are functions from plain objects to plain objects. No database,
no network, no React.

Scheduling logic is where the real complexity lives — overlapping items,
insufficient transfer time, a museum that closes before you arrive. That
complexity needs exhaustive tests, and tests are only cheap if the code under
test has no dependencies to stand up. Keeping the engines pure is what makes
"does this itinerary survive contact with a Tuesday" a unit test instead of an
integration suite.

It also means the same engine runs server-side during generation and
client-side during editing, so dragging an item shows a conflict immediately
rather than after a round trip.

## The generation pipeline

```
USER INPUT           wizard answers, must-dos, budget, preferences
      │
DATA COLLECTION      providers queried for the destination and dates
      │
REAL TRAVEL OPTIONS  candidates persisted to *Option tables
      │
AI PLANNING          Claude selects and sequences from the candidates
      │
VALIDATION           reality-check engine, structured warnings
      │
OPTIMIZATION         clustering, travel time, budget, pace
      │
STRUCTURED ITINERARY days, items, legs, budget ledger
```

The AI is a **selector and sequencer, not a source of facts**. It receives
concrete candidates — this hotel at this rate, this train at this time — and
decides what goes where. It is never asked to recall a price, a schedule or an
address, because it will produce a plausible one.

Its output is parsed against a strict Zod schema. Anything that fails the
schema is rejected and retried rather than partially trusted.

## Provider abstraction

Seven interfaces: flights, hotels, restaurants, activities, maps, transit,
weather. Each has a mock implementation that ships with the app and a live
implementation added later.

Selection happens in `providerMode()` in `src/lib/env.ts`, which returns
`mock` unless both the mode and the matching credential are set. Business
logic never names a vendor. Swapping Mapbox for Google is a change to one
module.

The mock implementations are not throwaway. They are how the app stays
runnable with no API keys, how tests stay deterministic, and how development
proceeds without burning quota.

## Data flow for a page

```
page.tsx  →  requireUser()  →  repository  →  view model  →  components
```

Pages render view models (`src/types/view.ts`), never database rows. View
models use ISO strings for dates and integer cents for money, so they cross
the server/client boundary without a serializer.

The repository is the seam. Today it returns sample data and reports
`source: "sample"`; when the database has trips it returns real ones and
reports `source: "database"`. Pages already handle both.

## Rendering

Server Components by default. Client Components only where interaction
demands it — currently the sidebar and mobile nav (they read the pathname) and
the error boundary.

Server Actions for mutations that originate in a form. Route handlers for
anything a client calls programmatically or that a third party might call.

## Security posture

- All provider credentials are server-side. The only client-exposed value is
  `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN`, which is designed to be public.
- `server-only` is imported by `env.ts`, `db.ts`, `auth.ts` and the
  repositories, so a stray client import fails the build rather than shipping
  server code to the browser.
- Every input is parsed with Zod at the boundary.
- Every trip-scoped operation checks ownership.
- Rate limiting sits behind an interface; the in-memory implementation is
  correct for one process and must be swapped for Redis before multi-tenant.
- Security headers are set in `next.config.ts`.

## What is deliberately not here yet

Sessions, real providers, the map, and the AI. Their seams exist — the auth
module, the provider interfaces, the maps abstraction, the repository — so
adding them does not require reshaping anything above them.
