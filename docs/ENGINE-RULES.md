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
A  eligibility (a constraint stops the engine before it computes anything)
   A1 any applicable constraint with blocked             reason blocked, omit = true (the API leaves it out of the session)
   A2 requires_clearance and cleared_at = null           reason requires_clearance, suggested null, stays in session
   A3 any other applicable constraint                    reason constrained, suggested null, stays in session.
      Stage B still runs. Stage C is skipped, so no weight is computed. Stage D still runs, and it now shows the
      cap, rep floor, tempo and physio note as information rather than clamping a number. David sets the weight.
      A2 and A3 both reach stage D, so an exercise awaiting clearance shows its limits too.
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
D  constraint display (A2 and A3 only, since a constraint now stops the engine)
   rep_low = max(rep_low, min_reps), rep_high = max(rep_high, rep_low), target_tempo = required_tempo
   constraint_max_weight_kg = the folded cap (A5), flag constrained, constraint notes attached
   no weight is computed and none is shown
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

**A withheld progression must say so.** When C3 would have fired on reps alone but is held back for want of
observed effort, the prescription's `rationale` must state that, and what unlocks it — one line where the load
appears, e.g. *"Holding 42.5 kg — tell me how hard the last set was and I can move it up."* Not an error, not a
nag. Without this line the rule trades one silent wrong (an assumed value treated as observed) for another (a
withheld progression that looks like a normal hold). Silent failure was the most expensive bug class on North;
this is the one place Omega could grow one.

**Existing rows** predate the field: treat a non-null `rir` with no `rir_observed` as observed, since assuming
otherwise would retroactively freeze progression on real history.

`consecutive_stalls` is **derived**: the count of `regress_load` reasons on done sessions since the most recent
`progress_load`. `ProgressionState` is a cache written from `next_state`, never an input.

Every prescription carries `reason`, `rationale`, `flags`, `constraint_notes`, `based_on_workout_id` and `omit`.
The rationale always names the weight actually prescribed (the clamp is applied before the text is finalised) and
explains what the clamp changed; `target_reps_by_set` is always exactly `target_sets` long. History is ordered by
date, then completion time, then id, so two sessions on the same date resolve deterministically.

## Deviations from the spec text

The spec had 32 internal contradictions. The rulebook resolves them, but not all resolutions are the same
kind of decision, and the distinction decides who gets to make them:

- **Forced** — only one reading is coherent. The repository settles it. Recorded, not approved.
- **Chosen** — both readings work and one was picked. That is a product decision and it needs David's explicit
  yes, even after the fact. Each is listed in `docs/DECISIONS-FOR-DAVID.md` until he rules.

### Forced

| # | Spec says | Engine does | Why only this reading works |
|---|---|---|---|
| F1 | §4 null-RIR sets don't count for volume | count with assumed RIR 2 (§5.1) | §4 and §5.1 flatly contradict; §5.1 is the specific rule |
| F2 | §4 ISO weeks | 7-day blocks anchored at the mesocycle start | a Sat/Sun/Wed microcycle straddles two ISO weeks, so the dashboard could never match the block's ramp |
| F3 | §5.5 judge L against `T` (current template) | judge L against its own stored targets | with §9.2's RIR ramp, a week-5 session prescribed RIR 1 and performed at RIR 1 would read as *under* the template's RIR 2 forever |
| F4 | §9.5 bench 42 kg | 42.5 kg | 2.5 kg barbell grid |

### Chosen, and ruled on by David, 8 September 2026

| # | Ruling |
|---|---|
| P1 | **Reversed.** David: *"If injured let the user figure it out no recommendation required."* The engine no longer prescribes a weight for a constrained exercise. His spec (5.2, 5.3) was right and my clamp was wrong. See amendment A4. |
| P2 | **Kept as built.** Soreness compromises only the exercises that train that muscle, not the whole session. David noted he distrusts soreness tracking generally, which matters less than it sounds: the rule only fires when he logs a rating of 4 or 5, and he has already dropped the daily readiness form, so it will rarely fire at all. |
| P3 | **Kept as built.** David: *"It should tell the app nothing."* An untouched effort slider is recorded as no answer and cannot add weight to the bar. |

Nothing on this page now overrides David's spec without his explicit yes.

## Amendments

Never a silent edit. Every change to a rule is numbered here with its reason.

| # | Date | Change | Reason |
|---|---|---|---|
| A1 | 8 Sep 2026 | `SetLog.rir_observed`; *The effort test* replaces "mean RIR over non-AMRAP units, none → satisfied" | design review: an untouched pre-fill and a genuine "easy" report produced identical `progress_load` output |
| A2 | 8 Sep 2026 | a withheld `progress_load` must explain itself in the rationale | wren's review: otherwise A1 swaps one silent failure for another |
| A3 | 8 Sep 2026 | deviation table split into forced and chosen; chosen ones go to David | wren's review: a document chalk wrote was overriding one David commissioned without his consent |
| A4 | 8 Sep 2026 | a constraint stops the engine (new A3) instead of clamping its answer (old stage D); no weight is prescribed for a constrained exercise | David's ruling on P1. This restores his spec 5.2 and 5.3 and removes the clamp arithmetic entirely |
| A5 | 9 Sep 2026 | `Prescription.constraint_max_weight_kg`, the folded cap, carried as a field rather than only inside the rationale prose | flint on PR #4. A4 left the cap as the only number David gets for a constrained exercise, and it existed nowhere but an English sentence, so the session screen could not render it without parsing prose |
| A6 | 12 Sep 2026 | prescribed ramps. `TemplateExercise.set_ramp` and `Prescription.target_weight_by_set`, both null by default, meaning a flat weight across all sets as today | David's ruling. A programme designed upstream may call for a pyramid or a reverse pyramid, and the engine could only ever prescribe one weight. Default stays flat because most training is flat and a ramp is a deliberate choice |

### A6 in full, because it is the first amendment that changes what a template can say

`TemplateExercise.set_ramp: number[] | null`. Percentages of the top working weight, one per set, in set
order. Null means flat, which is the default and what every existing template does. An ascending pyramid
is `[70, 85, 100]`. A reverse pyramid is `[100, 90, 80]`. Length mismatches against `target_sets` are
resolved by repeating the last entry, so a ramp survives the mesocycle set ramp adding a set.

The engine still decides exactly one number, the top working weight, by the existing stage C rules. The
ramp is applied afterwards, in stage D, as a transform: each set's weight is the top weight times its
percentage, rounded to the exercise's increment. Nothing in stages A, B or C changes, which is the point.
`Prescription.target_weight_by_set` carries the result and stays null when there is no ramp.

**The one genuinely new rule is which sets the engine judges.** Progression currently asks whether every
set reached the top of the rep range. Under a ramp that question is wrong, because a set at 70% is not
trying to. So: **the engine judges the sets prescribed at the highest percentage in the ramp, and ignores
the rest.** For `[70, 85, 100]` that is the last set. For `[100, 90, 80]` it is the first. For flat, it is
all of them, which is today's behaviour and why this generalises rather than special-cases.

Volume is not affected. A ramp set is still a set that happened, and the existing hard-set rule decides
whether it counts, exactly as it does for any other set. Marking a ramp set as a warmup stays the user's
call and still excludes it from both volume and progression.

Open and not settled: whether `set_ramp` should also be expressible in absolute kilograms rather than
percentages. Percentages progress by themselves when the top set moves, which is why they are the
proposal, but a fixed-increment ramp is a thing some programmes specify.

A note on the two meanings of the word constrained, since A4 gave it a second job. `constrained` is now both a
reason and a flag. The reason says why there is no weight. The flag says limits apply. A prescription with
reason `requires_clearance` also carries the flag, so a client must not render both as one badge.

## Seed-data caveats surfaced by the audit (not changed; the user decides)

- With `set_delta` 0,1,2,3,3 applied to **every** priority slot, weekly quad volume reaches ~32 sets by week 4 against a 15–20 target;
  biceps ~24 vs 12–15. The volume dashboard will read `over`. Options: mark only the first quad slot per day as priority, or use set_delta 0,1,1,2,2.
- Brachialis has a 4–8 target but nothing brachialis-primary in the templates (hammer curls are in the library, not a template).
- Lats/upper back will read `under` while chin-ups await clearance.
- Bayesian cable curl is standing; the rehab note says "seated only".
- "Preacher Curl" (template) and "Machine Curl" (restart loads) are seeded as two exercises; archive one if they are the same machine.
