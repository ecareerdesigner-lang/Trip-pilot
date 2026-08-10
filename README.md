# TripPilot AI

AI travel planning that treats getting there as part of the trip. Every walk,
subway ride and rideshare between two places is a scheduled leg with its own
time and cost, not a footnote under the destination.

**Status: Phase 1 complete** — project foundation and architecture. The shell,
dashboard and design system render; the trip wizard, planner and engines are
not built yet. Screens that exist ahead of their feature say so on the page.

## Requirements

- Node.js 20.9 or newer (built and verified on 22.22.2)
- PostgreSQL 14 or newer

## Setup

```bash
npm install
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

Fill in at minimum:

- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — generate with `openssl rand -base64 32`

Then:

```bash
npx prisma validate
npm run db:generate
npm run db:push
npm run dev
```

The app runs without any of this. With no `DATABASE_URL`, the dashboard falls
back to a sample dataset and labels it as sample data on screen.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run check` | Typecheck, lint and test together |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:push` | Push the schema to the database |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:studio` | Prisma Studio |

## Conventions

**Money is integer cents.** Every currency field is named `*Cents` and holds an
integer. Floats are never used for money. `src/lib/money.ts` has the helpers,
including `allocateCents`, which splits a total by weight without losing or
inventing a cent.

**Geography lives in `Location`.** Itinerary items, transportation legs and
provider options reference it rather than each carrying their own name,
latitude and longitude.

**Domain enums are mirrored by hand** in `src/types/domain.ts` so the planning
engines and the UI compile without a generated Prisma client.
`src/lib/schema-parity.test.ts` parses `schema.prisma` and fails the test run
if the two drift apart.

**Mock data is always labelled.** Anything not backed by a live provider is
marked `isMock` in the database and surfaced through `DataSourceNote` in the
UI. Nothing is presented as live availability unless it is.

**Auth runs through one seam.** Every trip-scoped operation calls
`requireUser()` and `assertOwnsTrip()` from `src/lib/auth.ts`, so adding real
sessions in Phase 22 is a change to that file rather than to every call site.

## Layout

```
prisma/schema.prisma     Database schema
src/app/                 App Router routes; (app) is the authenticated shell
src/components/ui/       Primitives — button, card, badge, stat, progress
src/components/layout/   Sidebar, mobile nav, page header
src/lib/                 Env, errors, logging, auth, money, formatting, data access
src/types/               Domain enums and view models
docs/                    Architecture notes (Phase 2)
```

## What is next

Phase 2 writes `docs/`, `AGENTS.md` and `prisma/seed.ts`. Phases 11 onward
build the wizard, the mock providers, the AI planner, and the validation,
optimization and budget engines.
