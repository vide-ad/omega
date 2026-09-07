# Engine rulebook (canonical)

This is the resolved, implementable form of spec §4–§5. Where the spec's prose and this page disagree,
**this page wins** — it was produced by auditing the spec for contradictions and choosing a consistent
reading. Implementation: `packages/core/src/engine/*`. Tests: `packages/core/src/engine/engine.test.ts`.

## Definitions

- **Working set** — `is_warmup = false`. Warmups never count for anything.
- **Effective RIR** — `is_amrap ? 0 : (rir ?? 2)`. Used for hard-set volume. For progression, an AMRAP set is RIR 0; a null RIR stays unknown.
- **Observed vs assumed RIR** — `SetLog.rir_observed` records whether a human asserted the value.
  `true` when the user picked it, or the set is AMRAP (RIR 0 by definition). `false` when the client's
  pre-filled default was never challenged. Only observed RIR may justify adding load — see C3.
- **Unit** — one bilateral set, or for a unilateral exercise the left+right pair sharing a `set_index`
  (reps = min of sides, RIR = mean of sides, weight = per-side load).
- **Done session** — `completed_at` set, or dated before today.
- **Qualifying session (for an exercise)** — done, workout not compromised, exercise not compromised
  (no moderate/stop pain on any set, no soreness ≥ 4 on a muscle it trains), and ≥ 1 unit with known RIR.
- **L** — most recent qualifying session. **L′** — the qualifying session before L. **M** — most recent done session, qualifying or not.
- **L.weight** — modal per-unit weight in L (ties → heavier).
- Performance conditions are judged against **L's own stored targets** (`target_rep_low/high`, `target_rir`
  on that `workout_exercise` row). Outputs use the **current** template + mesocycle week.

## Compromise (spec §5.2, as resolved)

Session level (`workout.is_compromised`, recomputed at completion and whenever that day's readiness changes):
`manual_compromised`, or `resting_hr > median(RHR over the prior 30 days, excluding today, ≥ 7 readings) + 7`,
or `sleep_hours < 5.5`, or the session is in a deload week. No readiness log for the day ⇒ readiness criteria are false.

Exercise level (`workout_exercise.is_compromised`): any set with pain `moderate`/`stop`, or a soreness entry ≥ 4 on that day for a
muscle the exercise trains (credit ≥ 0.5). Soreness is exercise-scoped so sore biceps do not invalidate squat progression.

**Constraints do not compromise an exercise.** Constrained exercises qualify and progress normally; the constraint
is applied as a clamp (stage D). This reverses the spec's literal §5.2 text because that reading made every
constrained exercise `first_time` forever, which contradicts §3.2 and §9.4.

## Volume (spec §4)

`weekly_sets[muscle] = Σ credit(exercise, muscle) × hard_units(workout_exercise)` where a unit is hard when its
minimum effective RIR ≤ 4. Weeks are **7-day blocks anchored at the active mesocycle's `start_date`** when the
workout date falls inside the block, else ISO weeks; sets are assigned by `Workout.date`. Seed the mesocycle
`start_date` on the first training day (Saturday) so Sat/Sun/Wed land in one week. Muscles without an active target → `no_target`.

## Prescription procedure (spec §5.5)

```
A  eligibility
   A1 any applicable constraint with blocked            → reason blocked, omit = true (API leaves it out of the session)
   A2 requires_clearance and cleared_at = null           → reason requires_clearance, suggested null, stays in session
B  structure (always)
   target_sets = max(1, round_half_up((base_sets + (is_priority ? week.set_delta : 0)) × week.volume_multiplier))
   target_rir  = clamp(template.rir_target, week.rir_target_low, week.rir_target_high)   (no week → template)
   last_set_amrap = template.last_set_amrap && !week.is_deload
C  load decision (first match wins)
   C1 no L                                               → first_time; weight = starting load rounded to increment, else M's weight, else null
   C2 deload week                                        → deload; weight = L.weight; no stall change
   C3 all units ≥ L.rep_high AND the effort test passes (below)
                                                         → progress_load: L.weight + increment; stalls = 0
                                                           (increment 0 → progress_reps, +1 per unit uncapped, flag unloadable)
   C4 all units ≥ L.rep_high AND meanRIR < L.target_rir  → consolidate: hold weight and range
   C5 any unit < L.rep_low AND any unit < L′.rep_low     → regress_load: round(L.weight × 0.9) strictly below L.weight; stalls + 1
   C6 otherwise                                          → progress_reps: per-unit target = min(reps + 1, T.rep_high); extra sets = T.rep_low
   C7 if M ≠ L (most recent done session was non-qualifying)
                                                         → relabel repeat_after_compromised, keep the C3–C6 output, stalls untouched
D  constraint clamp (when any constraint applies and A did not stop)
   weight = min(weight, max_weight_kg) floored to the increment grid; first_time with null weight starts at the cap
   rep_low = max(rep_low, min_reps); rep_high = max(rep_high, rep_low); per-set targets ≥ min_reps; chalk = required_tempo
   flag constrained; constraint notes attached; rationale states what the clamp changed
E  stall_review flag when consecutive_stalls ≥ 3
```

### The effort test (C3/C4)

`progress_load` may only fire on **evidence that the set was easy**, never on a default. The test passes when:

- there is at least one non-AMRAP unit with **observed** RIR, and the mean over those units ≥ the session's
  `target_rir`; **or**
- there are no non-AMRAP units at all (an AMRAP-only exercise) — going to failure and still reaching the top of
  the range is itself the evidence.

It fails when non-AMRAP units exist but **none** has an observed RIR. That falls through to C4 `consolidate`:
hold the weight until the lifter says it was easy.

Why this rule exists: the UI pre-fills RIR at the target, so an untouched chip previously produced
`meanRIR == target`, which satisfied `≥ target` and added load. Verified against the built engine — a pre-filled
RIR of 3 and a genuine report of RIR 4 both returned `progress_load 45 kg`, while a null RIR held at 42.5. The
convenience default was converting "we don't know" into "the lifter said it was easy", on the single input the
whole engine turns on. Assumed RIR still counts everywhere else: for hard-set volume, for qualification, and for
`progress_reps`. It buys you rep progression, not load progression.

**Existing rows** predate the field: treat a non-null `rir` with no `rir_observed` as observed, since assuming
otherwise would retroactively freeze progression on real history.

`consecutive_stalls` is **derived**: the count of `regress_load` reasons on done sessions since the most recent
`progress_load`. `ProgressionState` is a cache written from `next_state`, never an input.

Every prescription carries `reason`, `rationale`, `flags`, `constraint_notes`, `based_on_workout_id` and `omit`.
The rationale always names the weight actually prescribed (the clamp is applied before the text is finalised) and
explains what the clamp changed; `target_reps_by_set` is always exactly `target_sets` long. History is ordered by
date, then completion time, then id, so two sessions on the same date resolve deterministically.

## Known deliberate deviations from the spec text

| Spec says | Engine does | Why |
|---|---|---|
| §4 null-RIR sets don't count | count with assumed RIR 2 (§5.1) | §5.1 is more specific |
| §5.2 constraint ⇒ exercise compromised | constraint ⇒ clamp after the decision | otherwise constrained lifts never progress |
| §5.2 soreness compromises the workout | soreness compromises only exercises training that muscle | sore biceps should not block squats |
| §5.5 compare to `T` (template) | compare to the session's own stored targets | RIR ramps and multi-template rep ranges |
| §4 ISO weeks | mesocycle-anchored 7-day blocks inside a block | Sat/Sun/Wed microcycle |
| §9.5 bench 42 kg | 42.5 kg | 2.5 kg barbell grid |
| §7 "RIR pre-filled with the target" | pre-fill stays, but an untouched default cannot justify adding load | a default is not an observation |

## Seed-data caveats surfaced by the audit (not changed; the user decides)

- With `set_delta` 0,1,2,3,3 applied to **every** priority slot, weekly quad volume reaches ~32 sets by week 4 against a 15–20 target;
  biceps ~24 vs 12–15. The volume dashboard will read `over`. Options: mark only the first quad slot per day as priority, or use set_delta 0,1,1,2,2.
- Brachialis has a 4–8 target but nothing brachialis-primary in the templates (hammer curls are in the library, not a template).
- Lats/upper back will read `under` while chin-ups await clearance.
- Bayesian cable curl is standing; the rehab note says "seated only".
- "Preacher Curl" (template) and "Machine Curl" (restart loads) are seeded as two exercises; archive one if they are the same machine.
