# @omega/api

REST API + static host for the training log. Hono 4 on Node 22 with the built-in `node:sqlite`
driver (no native modules, no ORM). The contract is `docs/API.md`; the request/response types are
`packages/core/src/api-types.ts`; the engine rulebook is `docs/ENGINE-RULES.md`. The API never
reimplements engine logic — every prescription, compromise flag and volume tally comes from `@omega/core`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `OMEGA_TOKEN_WRITE` | — (**required**, ≥ 16 chars) | Bearer token with `write` scope. The server refuses to start without it (except `NODE_ENV=test`). |
| `OMEGA_TOKEN_READ` | unset | Optional second token with `read` scope (GET only). Must differ from the write token. |
| `OMEGA_DB_PATH` | `./data/omega.db` | SQLite file (directory is created). `:memory:` is accepted. |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Listen address. |
| `OMEGA_STATIC_DIR` | `../web/dist` (relative to this package) | Built PWA to serve at `/`. Skipped when the directory has no `index.html`. |
| `NODE_ENV` | — | `test` relaxes the token requirement for in-process tests. |

A `.env` file in the working directory is read at startup (simple `KEY=VALUE` lines, `#` comments,
quotes stripped; existing environment variables win). Copy `.env.example` and generate tokens with
`openssl rand -hex 32`. Tokens are only ever read from the `Authorization: Bearer …` header — never
from query strings.

## Running

```bash
# from the repo root (dependencies are installed with pnpm install; @omega/core must be built)
pnpm --filter @omega/core build

cd apps/api
cp .env.example .env            # then set real tokens
pnpm migrate                    # create/upgrade the schema (also runs automatically at server start)
pnpm seed                       # idempotent seed: library, targets, templates, injury, restart loads
pnpm seed -- --start=2026-09-12 # anchor the mesocycle on a specific Saturday (default: next Saturday)
pnpm dev                        # tsx watch src/server.ts
pnpm build && pnpm start        # compile to dist/ (migrations copied alongside) and run with node
pnpm typecheck && pnpm test     # tsc --noEmit, vitest (in-memory SQLite)
pnpm smoke                      # boots a real server on a throwaway database and walks the main flow
```

Seeding notes: re-running `pnpm seed` upserts library rows but **keeps** an existing mesocycle's
`start_date` (pass `--start=` to move it), never overwrites a live `progression_state.working_weight_kg`,
and never revokes a constraint clearance already granted. The mesocycle should start on the first
training day (Saturday for the seed templates) so Sat/Sun/Wed fall in one volume week.

## Endpoints

Everything under `/api/v1` needs a bearer token (`GET` accepts read or write; `POST/PATCH/PUT/DELETE`
need write). `GET /api/health` is open. See `docs/API.md` for the full table. Conventions:

- Errors: `{ "error": { "code": "unauthorized|forbidden|not_found|validation_error|conflict|internal", "message", "details?" } }`
  — zod issues are returned in `details`.
- Every `POST` that creates a row accepts a client-supplied `id`; re-posting the same id returns the
  existing row with `200` (offline replay is idempotent). New rows are `201`.
- Lists: `?limit=` (default 50, max 200) and `?cursor=` (opaque, base64 of the last sort key) → `{ items, next_cursor }`.
- Sets: `is_amrap: true` forces `rir: 0`; unilateral exercises need `side: left|right` (a pair shares
  `set_index`), bilateral ones need `side: bilateral`.
- `POST /workouts` runs the progression engine per template exercise and stores the whole prescription
  (`reason`, `rationale`, `flags`, `target_reps_by_set`, `target_tempo`, `constraint_notes`, …) on the
  `workout_exercises` row; blocked exercises come back under `omitted[]`.
- `PATCH /workouts/:id` with `completed_at` recomputes `is_compromised` at session and exercise level and
  refreshes `progression_state`. `POST /readiness` (upsert by date) relinks and recomputes the workouts of that day.
- `PATCH /templates/:id` with `exercises` creates a new version (old `template_exercises` rows are kept and
  `GET /templates/:id?version=N` returns them); metadata-only patches edit in place.

## For the coach

```bash
API=http://localhost:8787/api/v1
TOKEN=...   # read token is enough for GET

# Start every conversation here: volume vs targets, adherence, progression per exercise, readiness, cardio, pain flags, injuries
curl -s -H "Authorization: Bearer $TOKEN" "$API/summary?weeks=4" | jq .

# Per-muscle hard sets per week (block-anchored inside the active mesocycle)
curl -s -H "Authorization: Bearer $TOKEN" "$API/volume?weeks=4" | jq '.weeks[-1].muscles'

# Why the engine prescribes what it prescribes for one lift
curl -s -H "Authorization: Bearer $TOKEN" "$API/progression/<exercise_id>" | jq '{next, history}'

# Coach writes (write token): adjust a target, cap a lift after a flare, lay out the next block
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  "$API/volume-targets/biceps" -d '{"min_sets":10,"max_sets":14,"priority":"priority","active":true}'
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  "$API/injuries/<injury_id>/constraints" -d '{"movement_pattern":"elbow_flexion","max_weight_kg":6,"min_reps":15,"note":"Escalated 1 kg after two pain-free weeks"}'
```

## Serving the PWA

Build the web app (`pnpm --filter @omega/web build`) and start this server: it serves
`apps/web/dist` at `/` with an SPA fallback to `index.html` for any non-`/api` navigation, correct
content types (`sw.js` → `text/javascript` with `Service-Worker-Allowed: /`, `manifest.webmanifest` →
`application/manifest+json`), `no-cache` on the shell/service worker and long-lived caching for hashed
`assets/`. Point `OMEGA_STATIC_DIR` elsewhere to serve a different build. The API answers CORS preflights
with `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: Authorization, Content-Type`, so
the Vite dev server can talk to it directly during development.

## Layout

```
src/
  app.ts            createApp({ db, tokens?, now? }) — the Hono app (tests use app.request())
  server.ts         .env, migrations, static host, listen
  auth.ts           bearer middleware / token config
  validation.ts     zod schemas for every body
  db/               connection (WAL, foreign keys), migrations/NNN_*.sql, typed repos
  services/         engine integration: prescription, compromise, workouts, volume, progression, readiness, summary
  routes/           one module per resource group
  cli/              migrate.ts, seed.ts
  seed.ts           idempotent seed from @omega/core
```
