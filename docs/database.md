# Database

PostgreSQL via Prisma. Schema: `prisma/schema.prisma`.

## Conventions

**UUID primary keys** on every model, `@db.Uuid`. Trip ids appear in URLs;
sequential integers would let anyone enumerate other people's trips.

**`createdAt` / `updatedAt`** on every model.

**Money as integer cents.** Every currency column is an `Int` named `*Cents`.
See `AGENTS.md` for why.

**Snake-case table names** via `@@map`, camelCase in application code.

**Cascade on ownership, set-null on reference.** Deleting a trip deletes its
days, items, legs, budgets and options. Deleting a `Location` does not delete
the items that pointed at it — they keep their times and costs and lose the
place.

## Model map

```
User
 └── Trip
      ├── TripPreference          (1:1 — pace, food, transport prefs)
      ├── TripDay                 (one per calendar day)
      │    └── ItineraryItem      (the schedule)
      │         ├── TransportationLeg  (legs that deliver you TO this item)
      │         ├── Reservation        (1:1, optional)
      │         └── MustDo             (1:1 back-link when scheduled)
      ├── MustDo                  (requirements, outrank AI suggestions)
      ├── Budget                  (ledger row per category)
      ├── Reservation
      ├── TravelDocument
      ├── HotelOption             ┐
      ├── RestaurantOption        │ provider candidates the AI plans from
      ├── ActivityOption          │
      └── TransportationOption    ┘

Location  ← referenced by items, legs and all option tables
```

## Decisions worth knowing

### `Location` is the only home for geography

Items, legs and options reference `Location` by id. The alternative — putting
`latitude`/`longitude` on each — means a museum visited on two days has two
copies of its coordinates, and a corrected address fixes only one of them.

`Location` also carries `providerRef` and `providerName`, so a place resolved
from Google Places can be recognized again on the next trip instead of being
re-created.

### `TransportationLeg` vs `TransportationOption`

Different jobs, easily confused.

**`TransportationOption`** is a *candidate*: flights the provider returned for
your dates, with fares and times. Several per trip, one eventually `selected`.
This is what the AI chooses from.

**`TransportationLeg`** is *scheduled*: a leg that exists on the itinerary. It
has a `legOrder` so a multi-leg journey keeps its sequence, and a `toItemId`
naming the item it delivers you to.

A walk → subway → walk journey to a museum is three legs with `legOrder` 0, 1,
2, all pointing at the museum item.

### `Budget` is a ledger, not an allocation

`Trip` holds what the traveler said they would spend
(`lodgingBudgetCents` and siblings). `Budget` rows hold `plannedCents`
(recomputed from itinerary estimates) and `actualCents` (recorded spend).

Splitting these means the allocation has exactly one authoritative copy.
Variance is `planned - allocated`, computed rather than stored, so it cannot
go stale.

### `ItineraryItem.source` and `priority`

`source` records where an item came from: `MUST_DO`, `AI_SUGGESTION`,
`PROVIDER`, `USER`, `SYSTEM`. The optimizer uses it to enforce the rule that
must-dos outrank suggestions — when something has to give, an AI suggestion
gives first.

### `isMock`

On every provider-sourced table. Set when the row came from a mock provider.
The UI reads it to label sample data. It is the mechanism behind the rule that
nothing is ever presented as live availability unless it is.

## Indexes

Chosen for the queries the app actually makes:

| Index | Serves |
| --- | --- |
| `trips(userId, status)` | Dashboard sections |
| `trips(userId, startDate)` | Upcoming/past split, next-up |
| `trip_days(tripId, date)` unique | One day row per calendar day |
| `itinerary_items(tripDayId, startTime, sortOrder)` | Rendering a day in order |
| `itinerary_items(tripId, startTime)` | Whole-trip timeline, validation |
| `transportation_legs(toItemId, legOrder)` | Multi-leg journeys in sequence |
| `budgets(tripId, category)` unique | Ledger upsert |
| `locations(providerName, providerRef)` | Place de-duplication |

## Commands

```powershell
npx prisma validate      # schema syntax and relations
npm run db:generate      # regenerate the typed client — after every schema edit
npm run db:push          # sync schema to the database, no migration file
npm run db:migrate       # create and apply a migration
npm run db:seed          # load the sample trip
npm run db:studio        # browse the data
```

`db:push` is right for solo development. Switch to `db:migrate` once the
schema is stable or anyone else is running the project, so schema history is
recorded.

Regenerate the client after **every** schema change. Stale client types
produce type errors that look like code bugs.

## Local setup

PostgreSQL 17 at `localhost:5432`, database `trippilot`.

```
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/trippilot?schema=public"
```

If the password contains `@`, `:`, `/`, `#`, `?`, `%` or `&`, URL-encode it or
the connection string parses wrong:

```powershell
[uri]::EscapeDataString('your password')
```

Common errors:

| Code | Means |
| --- | --- |
| P1000 | Wrong password, or unencoded special characters |
| P1001 | Server not reachable — service stopped, or wrong port |
| P1003 | Database does not exist — `createdb -U postgres trippilot` |
| P1012 | `DATABASE_URL` not set, or `dotenv/config` missing from `prisma.config.ts` |
