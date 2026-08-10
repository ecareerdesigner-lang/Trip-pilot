# API

Route handlers under `src/app/api/`. **None of these are implemented yet** —
this is the contract Phases 12 onward build to.

Every route follows the same shape:

1. `requireUser()`
2. Parse the body with Zod
3. Load the trip and `assertOwnsTrip()`
4. Do the work
5. Return JSON, or `toErrorBody()` on any throw

## Conventions

**Money** is integer cents in both directions. A request sending `totalBudget:
3000` means thirty dollars, not three thousand. Field names carry `Cents`.

**Dates** are ISO 8601. Trip start/end are calendar dates (`2026-09-18`);
itinerary times are instants (`2026-09-18T14:30:00Z`).

**Errors** always take this shape, and never contain a stack trace:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields need attention.",
    "details": { "startDate": ["Start date must be before end date."] },
    "traceId": "0f8c2c4e-..."
  }
}
```

`traceId` matches a line in the server log. Show it to the user; it is how a
report becomes debuggable.

| Code | Status |
| --- | --- |
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `VALIDATION_FAILED` | 422 |
| `RATE_LIMITED` | 429 |
| `INTERNAL` | 500 |
| `PROVIDER_UNAVAILABLE` / `AI_FAILED` | 502 |
| `DATABASE_UNAVAILABLE` | 503 |

## Trips

### `POST /api/trips`

Create a trip from the wizard. Category budgets are optional; when omitted
they are allocated from `totalBudgetCents` using `DEFAULT_BUDGET_WEIGHTS` and
`allocateCents`, which preserves the exact total.

```json
{
  "name": "Broadway weekend",
  "origin": "Charlotte, NC",
  "destination": "New York City",
  "startDate": "2026-09-18",
  "endDate": "2026-09-21",
  "travelers": 2,
  "travelMethod": "FLIGHT",
  "transportationIntent": "SEARCH",
  "totalBudgetCents": 300000,
  "preference": {
    "pace": "BALANCED",
    "foodPreference": "LOCAL_FAVORITES",
    "transportPreferences": ["PUBLIC_TRANSPORT_PREFERRED"]
  },
  "mustDos": [{ "title": "See a Broadway show" }],
  "notes": "Anniversary trip."
}
```

Returns `201` with the created trip. Creates `TripDay` rows for the range and
`Budget` ledger rows for every category.

### `GET /api/trips`

Query: `status`, `limit`, `cursor`. Returns summaries, not full itineraries.

### `GET /api/trips/[id]`

Full trip with days, items, legs, must-dos, budget and reservations.

### `PATCH /api/trips/[id]`

Partial update. Changing `startDate` or `endDate` adds or removes `TripDay`
rows; items on a removed day are returned in the response as `orphanedItems`
rather than silently deleted.

### `DELETE /api/trips/[id]`

Cascades to everything the trip owns. `204`.

## Planning

### `POST /api/trips/[id]/generate`

Runs the full pipeline. Rate limited. Long-running — streams progress events
matching the wizard's build screen:

```
analyzing_destination → finding_lodging → finding_activities →
planning_meals → planning_transportation → checking_conflicts →
optimizing_budget → building_itinerary
```

Replaces any existing generated itinerary. Items with `source: "USER"` are
preserved.

### `POST /api/trips/[id]/optimize`

Reorders and re-times an existing itinerary without inventing new items.
Optional body `{ "days": ["2026-09-19"] }` to scope it.

Returns the itinerary plus a `changes[]` list, so the UI can say what moved
rather than silently rewriting the day.

### `POST /api/trips/[id]/validate`

Read-only. Runs the reality-check engine.

```json
{
  "warnings": [
    {
      "severity": "ERROR",
      "code": "INSUFFICIENT_TRAVEL_TIME",
      "message": "Your museum visit ends at 5:30 PM but the show begins at 6:00 PM and travel takes 35 minutes.",
      "itemIds": ["...", "..."],
      "suggestion": "Leave the museum by 5:20 PM, or move it earlier."
    }
  ],
  "counts": { "ERROR": 1, "WARNING": 2, "INFO": 0 }
}
```

### `POST /api/trips/[id]/chat`

The per-trip assistant. Rate limited.

```json
{ "message": "Move the museum to tomorrow." }
```

The assistant modifies the itinerary, re-runs validation, recalculates
transportation and budget, and reports what changed. The response carries both
the reply and the structured `changes[]`, so the UI updates rather than
requiring a reload.

## Itinerary

### `POST /api/trips/[id]/itinerary`

Add an item. Recalculates inbound legs and returns fresh validation warnings.

### `PATCH /api/trips/[id]/itinerary/[itemId]`

Edit or move an item. Any time or location change recalculates the legs into
and out of it and re-validates the affected day.

### `DELETE /api/trips/[id]/itinerary/[itemId]`

Removes the item and its inbound legs. If it satisfied a must-do, that must-do
returns to `UNSCHEDULED` rather than being lost.

## Read-only

### `GET /api/trips/[id]/budget`

Per category: allocated, planned, actual, remaining, variance. Plus a
projection and whether it exceeds the total.

### `GET /api/trips/[id]/transportation`

Every leg grouped by day, with multi-leg journeys assembled in `legOrder`.

## Rate limiting

`generate`, `optimize` and `chat` go through `aiRateLimiter()`. Default 20 per
hour per user, configurable via `RATE_LIMIT_MAX` and
`RATE_LIMIT_WINDOW_SECONDS`.

Limited responses return `429` with `Retry-After`.

The in-memory limiter is per-process. Before this runs on more than one
instance, implement `RateLimiter` against Redis — call sites do not change.
