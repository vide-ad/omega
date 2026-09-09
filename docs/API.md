# REST API contract (v1)

Base path: `/api/v1`. JSON in and out. Types for every request/response live in
`packages/core/src/api-types.ts` and are the source of truth; this page is the human index.

## Auth (spec §6.1)

- `Authorization: Bearer <token>`. Two static tokens from env: `OMEGA_TOKEN_WRITE` (scope `write`) and
  `OMEGA_TOKEN_READ` (scope `read`).
- `GET` needs `read` or `write`. `POST`/`PATCH`/`PUT`/`DELETE` need `write`.
- Missing/invalid token → `401 { error: { code: "unauthorized" } }`. Read token on a mutation → `403 forbidden`.
- Tokens never appear in query strings. `GET /api/health` is the only unauthenticated route (`{ ok: true, version }`).

## Conventions (spec §6.3)

- Dates `YYYY-MM-DD`; timestamps ISO 8601 UTC; weights kg.
- Errors: `{ "error": { "code": "unauthorized"|"forbidden"|"not_found"|"validation_error"|"conflict"|"internal", "message": "...", "details"?: ... } }`.
- Validation with zod; a `validation_error` carries the zod issues in `details`.
- List endpoints accept `?limit=` (default 50, max 200) and `?cursor=` and return `{ items, next_cursor }`.
- **Idempotent creates:** every `POST` that creates a row accepts a client-supplied UUID `id`. Re-posting the same
  `id` returns the existing row with `200` instead of creating a duplicate. This is what makes offline replay safe.
- Every prescription object carries `reason` (machine) and `rationale` (human) plus `flags` and `constraint_notes`.
- A constrained exercise gets no `suggested_weight_kg` at all (amendment A4), so `constraint_max_weight_kg`
  carries the physio's cap as a number rather than only inside the rationale prose (amendment A5). It is the
  lowest cap across every constraint that applies, and it is null when no constraint sets one. The rep floor is
  already in `target_rep_low` and the tempo in `target_tempo`, so the cap was the only limit a client could not
  render without parsing an English sentence.
- `constrained` is both a reason and a flag, and they mean different things. The reason says why no weight was
  prescribed. The flag says limits apply. A prescription with reason `requires_clearance` also carries the flag,
  so do not render the two as one badge.

## Endpoints

### Exercise library
| Method | Path | Body → Response |
|---|---|---|
| GET | `/exercises?muscle=&pattern=&archived=&q=` | → `Paginated<ExerciseWithCredits>` |
| GET | `/exercises/:id` | → `ExerciseDetail` (credits + active constraints) |
| POST | `/exercises` | `ExerciseCreate` → `ExerciseWithCredits` (201) |
| PATCH | `/exercises/:id` | `ExercisePatch` → `ExerciseWithCredits` (credits replaced when given) |
| GET | `/muscle-groups` | → `{ items: MuscleGroup[] }` |

### Templates and mesocycles
| Method | Path | Body → Response |
|---|---|---|
| GET | `/templates?archived=false` | → `{ items: TemplateWithExercises[] }` (latest version of each) |
| GET | `/templates/:id?version=` | → `TemplateWithExercises` |
| POST | `/templates` | `TemplateCreate` → `TemplateWithExercises` (201, version 1) |
| PATCH | `/templates/:id` | `TemplatePatch` → `TemplateWithExercises` (**always** a new version; old `template_exercises` rows are kept) |
| GET | `/mesocycles` | → `{ items: MesocycleWithWeeks[] }` |
| GET | `/mesocycles/current` | → `CurrentMesocycle` or `404` if no active block |
| POST | `/mesocycles` | `MesocycleCreate` → `MesocycleWithWeeks` (201). Setting `status: "active"` demotes any other active block to `complete`. |
| PATCH | `/mesocycles/:id` | `Partial<Mesocycle>` → `MesocycleWithWeeks` |

### Sessions
| Method | Path | Body → Response |
|---|---|---|
| GET | `/workouts?from=&to=&exercise_id=&limit=&cursor=&include_sets=` | → `Paginated<WorkoutListItem>` newest first |
| GET | `/workouts/:id` | → `WorkoutDetail` |
| POST | `/workouts` | `WorkoutCreate` → `WorkoutDetail` (201). Resolves the mesocycle week for `date`, runs the progression engine per template exercise, stores the full prescription on each `workout_exercises` row (suggested weight, targets, `target_reps_by_set`, `target_tempo`, `last_set_amrap`, `reason`, `rationale`, `flags`, `constraint_notes`, `based_on_workout_id`), links the day's readiness log if present. Exercises whose prescription has `omit = true` (blocked constraint) are not added and are returned under `omitted[]`. |
| PATCH | `/workouts/:id` | `WorkoutPatch` → `WorkoutDetail`. Setting `completed_at` recomputes `workout.is_compromised` (session rules) and each `workout_exercise.is_compromised` (pain / soreness on trained muscles) per docs/ENGINE-RULES.md, then refreshes `progression_state` for each exercise. |
| DELETE | `/workouts/:id` | → 204 (cascades sets) |
| POST | `/workouts/:id/exercises` | `{ exercise_id, order?, target_sets?, ... }` → `WorkoutExerciseDetail` (ad-hoc add; prescription still computed) |
| POST | `/workouts/:id/sets` | `SetCreate` → `SetLog` (201 / 200 if id already exists) |
| PATCH | `/sets/:id` | `SetPatch` → `SetLog` |
| DELETE | `/sets/:id` | → 204 |

### Readiness and cardio
| Method | Path | Body → Response |
|---|---|---|
| GET | `/readiness?from=&to=` | → `ReadinessResponse` (defaults: last 30 days) |
| POST | `/readiness` | `ReadinessUpsert` → `ReadinessWithSoreness` (upsert by `date`) |
| GET | `/cardio?from=&to=` | → `{ items: CardioSession[] }` |
| POST | `/cardio` | `CardioCreate` → `CardioSession` (201) |
| DELETE | `/cardio/:id` | → 204 |

### Coaching reads
| Method | Path | Response |
|---|---|---|
| GET | `/volume?weeks=4` | `VolumeResponse` — per ISO week, per muscle, `under`/`in_range`/`over`/`no_target` |
| GET | `/progression` | `{ items: ProgressionSummaryItem[] }` — every non-archived exercise with history or state |
| GET | `/progression/:exercise_id` | `ProgressionDetail` |
| GET | `/injuries?status=active` | `{ items: InjuryWithConstraints[] }` |
| GET | `/summary?weeks=4` | `SummaryResponse` — **the coach's first call each conversation** |

### Coaching writes
| Method | Path | Body → Response |
|---|---|---|
| PUT | `/volume-targets/:muscle_group_key` | `VolumeTargetPut` → `MuscleVolumeTarget` |
| GET | `/volume-targets` | → `{ items: MuscleVolumeTarget[] }` |
| POST | `/injuries` | `Omit<Injury,'id'> & { id? }` → `InjuryWithConstraints` (201) |
| PATCH | `/injuries/:id` | `Partial<Injury>` → `InjuryWithConstraints` |
| POST | `/injuries/:id/constraints` | `ConstraintCreate` → `ExerciseConstraint` (201) |
| PATCH | `/constraints/:id` | `Partial<ExerciseConstraint>` → `ExerciseConstraint` |
| DELETE | `/constraints/:id` | → 204 |

### The coach write gate

Spec §6.2 wants coach-originated changes to be **proposals the user confirms in-app**, not silent mutations. That
layer is not built yet. Until it is:

**The coach token is `OMEGA_TOKEN_READ`, and nothing else.** This is a hard precondition, not a plan: `pending_review`
proposals ship *before* any coach credential is ever issued with write scope, and the token's scope is the
enforcement. A coach with write access and no proposal layer can silently rewrite volume targets or a template,
and silent is the word that matters. Deferred items drift; this one may not.

## Offline model (spec principle 3, §7)

The PWA keeps a read cache of API responses in IndexedDB and an **outbox** of mutations
`{ op_id, method, path, body, created_at }`. Mutations apply optimistically to the local cache and are replayed
in order whenever the app is online; because creates carry client UUIDs, replay is idempotent. The server database
is the durable source of truth (the coach reads it while the phone is off). Single user, single device: no CRDTs.

## Progression engine integration

The rulebook is `docs/ENGINE-RULES.md`. `POST /workouts` builds, per template exercise, a `PrescribeInput` from `@omega/core`:
- `history` = every prior `workout_exercise` for that exercise (any template) with its sets, the parent workout's
  `id/date/is_compromised/completed_at`, and the row's stored `target_*`, `reason`, `is_compromised`;
- `constraints` = `activeConstraintsFor(exercise, allConstraints, injuries)`;
- `week` = the active mesocycle's week for `date` (null outside a block);
- `starting_load_kg` = `progression_state.working_weight_kg` if a row exists (seeded from §9.5 restart loads, or set when the user
  enters a starting load in-app), else null;
- `today` = the workout date.

It stores the prescription fields on the `workout_exercises` row and upserts `progression_state` with `next_state`.
Stalls and baseline are derived from history by the engine; the API never feeds `progression_state` back except as the starting load.
On write of a set with `is_amrap = true`, the API forces `rir = 0` and `rir_observed = true` (failure is an
observation). On `POST` a missing `rir_observed` means `true`, so importers and the coach are unaffected. On
`PATCH` a missing `rir_observed` means unchanged, which is the trap: a patch that sets a new `rir` and omits
`rir_observed` leaves a set that was recorded as an assumption still marked as one. Send both fields together
whenever you change `rir`. The server cannot infer it, because a client that patches a whole row sends every
field including one the user never touched. See *The effort test* in `docs/ENGINE-RULES.md`
for why an assumed RIR cannot trigger `progress_load`. On unilateral exercises, `side` must be `left`/`right` and
left/right sets of one pair share `set_index`; bilateral exercises use `side = 'bilateral'`.
When a user logs a first working set at a weight different from the suggestion, nothing special happens: the next
prescription derives from what was actually lifted (`L.weight`).
