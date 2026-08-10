# Development

## Setup

Requires Node 20.9+ and PostgreSQL 14+ (developed on Node 22.22, PostgreSQL 17).

```powershell
npm install
Copy-Item .env.example .env
```

Set `DATABASE_URL` and `AUTH_SECRET`, then:

```powershell
npx prisma validate
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Generate `AUTH_SECRET` with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The app runs with no database at all — the dashboard falls back to sample data
and says so on screen. The database is only needed once trips are being saved.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run check` | Typecheck, lint and test together |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:push` | Sync schema to the database |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Load the sample trip |
| `npm run db:studio` | Browse the data |

`npm run check` before declaring anything done.

## Phases

Complete:

1. ✅ Environment inspected
2. ✅ Node and npm confirmed
3. ✅ Next.js application
4. ✅ Dependencies
5. ✅ Folder structure
6. ✅ Prisma configuration
7. ✅ Database schema
8. ✅ Environment configuration
9. ✅ Application shell
10. ✅ Dashboard
11. ⬜ Trip creation wizard
12. ⬜ Trip database CRUD
13. ⬜ Mock travel providers
14. ⬜ AI trip planner
15. ⬜ Itinerary engine
16. ⬜ Transportation engine
17. ⬜ Budget engine
18. ⬜ Validation engine
19. ⬜ Optimization engine
20. ⬜ Trip AI chat
21. ⬜ Map abstraction
22. ⬜ Authentication
23. ⬜ Real API integrations
24. ⬜ Tests
25. ⬜ Security review
26. ⬜ UX review
27. ⬜ Production build

Docs, `AGENTS.md` and the seed script were added alongside phases 1–10.

Order matters in a few places. Providers (13) come before the planner (14)
because the planner selects from provider candidates. The engines (15–19) come
before chat (20) because chat drives them. Auth (22) comes before real APIs
(23) so no live credential is ever exercised by an unauthenticated request.

## Testing

Vitest, Node environment. Files live next to what they test.

```powershell
npm test
npm run test:watch
npx vitest run src/lib/money.test.ts
```

What is worth testing here:

- **Pure engines** — validation, optimization, budget. These carry the
  complexity and have no dependencies, so cover them thoroughly.
- **Money and dates** — off-by-one errors in cents and days are the bugs most
  likely to reach a user and least likely to be noticed.
- **Schema parity** — `schema-parity.test.ts` fails if `types/domain.ts` and
  `schema.prisma` drift.
- **Seed fixtures** — `prisma/seed-data.test.ts` asserts the sample itinerary
  is internally consistent: chronological, non-overlapping, legs sequenced,
  budget totals matching.

Not worth testing: component rendering, Prisma itself, third-party libraries.

## House rules

**Complete files, not diffs.** Whole files get pasted into VS Code.

**PowerShell.** `Copy-Item`, not `cp`.

**Regenerate after schema changes.** `npm run db:generate` after every edit to
`schema.prisma`. Stale client types produce errors that look like code bugs.

**Business logic stays out of components.** If a component computes something
a test would want to check, it belongs in `lib/`.

## Git

```powershell
git add -A
git commit -m "message"
git pull origin main
git push origin main
```

`.env` is ignored; `.env.example` is committed. If a credential ever lands in
a commit, rotate it — removing it from the working tree does not remove it
from history.

## Troubleshooting

**`P1012: Environment variable not found: DATABASE_URL`**
`prisma.config.ts` must import `dotenv/config` on its first line. A Prisma
config file disables the CLI's automatic `.env` loading.

**`P1000: Authentication failed`**
Wrong password, or unencoded special characters in it. Encode with
`[uri]::EscapeDataString('password')`.

**`P1003: Database does not exist`**
`createdb -U postgres trippilot`

**`psql` not recognized**
Not on PATH. `$env:Path += ";C:\Program Files\PostgreSQL\17\bin"` for the
session, or set it permanently in the user environment.

**`Property 'trip' does not exist on type 'PrismaClient'`**
Client not generated. `npm run db:generate`.

**npm skipped install scripts**
npm 11+ gates postinstall scripts. Prisma's engines, esbuild's binary and
ESLint's native resolver all need theirs. `npm approve-scripts
--allow-scripts-pending` then `npm rebuild`.

**Fonts look wrong**
They load from the Google Fonts CDN at runtime, so a build never needs
network. Offline, the system stack takes over — layout is unaffected.
