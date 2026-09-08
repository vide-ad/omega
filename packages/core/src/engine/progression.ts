import type {
  Exercise, ExerciseConstraint, MesocycleWeek, Prescription, PrescriptionFlag, PrescriptionReason,
  ProgressionState, SetLog, TemplateExercise, Workout, WorkoutExercise,
} from '../types.js';
import { foldConstraints } from './constraints.js';
import { daysBetween } from './dates.js';
import { e1rm } from './e1rm.js';
import { clampTargetRir, rampedTargetSets, roundHalfUp } from './mesocycle.js';
import { effectiveRir } from './volume.js';

export const ROLLING_WINDOW_DAYS = 21;
export const REGRESSION_FACTOR = 0.9;
export const STALL_REVIEW_THRESHOLD = 3;

/** One past performance of an exercise: the workout, the prescription it was given, and the sets logged. */
export interface ExerciseSessionRecord {
  workout: Pick<Workout, 'id' | 'date' | 'is_compromised' | 'completed_at'>;
  workout_exercise: Pick<WorkoutExercise, 'id' | 'target_rep_low' | 'target_rep_high' | 'target_rir' | 'target_sets' | 'suggested_weight_kg' | 'reason' | 'is_compromised'>;
  sets: readonly SetLog[];
}

export interface PrescribeInput {
  exercise: Pick<Exercise, 'id' | 'name' | 'weight_increment_kg' | 'is_unilateral'>;
  template: Pick<TemplateExercise, 'base_sets' | 'is_priority' | 'rep_low' | 'rep_high' | 'rir_target' | 'last_set_amrap'>;
  week: MesocycleWeek | null;
  /** All past sessions of this exercise (any order). Sessions with no working sets are ignored. */
  history: readonly ExerciseSessionRecord[];
  /** Constraints that apply to this exercise right now (see `activeConstraintsFor`). */
  constraints: readonly ExerciseConstraint[];
  /** Starting load used only when no qualifying session exists (restart loads, user-entered start). */
  starting_load_kg: number | null;
  today: string;
  rolling_window_days?: number;
}

export interface PrescribeResult {
  prescription: Prescription;
  /** Cache row for §3.7; fully derived from `history`, never an input. */
  next_state: ProgressionState;
}

// ---------------------------------------------------------------------------
// Session analysis
// ---------------------------------------------------------------------------

/** A working "unit": one bilateral set, or one left/right pair for a unilateral exercise. */
export interface WorkUnit {
  set_index: number;
  reps: number;            // pair: min(left, right)
  rir: number | null;      // effective (AMRAP is 0); pair: mean of sides
  is_amrap: boolean;
  /**
   * Did a human assert this unit's RIR? An AMRAP set is observed by definition (it was taken to
   * failure). A pair counts as observed only when both sides are, since the unit's RIR is their mean
   * and one assumed side makes the mean an assumption. See "The effort test" in docs/ENGINE-RULES.md.
   */
  rir_observed: boolean;
  weight_kg: number;       // pair: max of sides (should be equal)
  set_ids: string[];
}

export interface SessionAnalysis {
  record: ExerciseSessionRecord;
  done: boolean;                 // completed, or dated before today
  units: WorkUnit[];             // working units in order
  working_sets: SetLog[];        // raw non-warmup sets
  qualifying: boolean;
  non_qualifying_reason: 'not_completed' | 'workout_compromised' | 'exercise_compromised' | 'pain' | 'no_rir' | null;
  weight_kg: number | null;      // modal working weight (ties → heavier)
  reps: number[];                // per unit
  mean_rir: number | null;       // over NON-AMRAP units with an OBSERVED RIR; null if none
  non_amrap_units: number;       // count of NON-AMRAP units, observed or not
  all_at_or_above_high: boolean; // vs the session's OWN target_rep_high
  any_below_low: boolean;        // vs the session's OWN target_rep_low
  best_e1rm: number | null;
}

function sideOrder(s: SetLog['side']): number { return s === 'left' ? 0 : s === 'right' ? 1 : 2; }

export function modeWeight(units: readonly Pick<WorkUnit, 'weight_kg'>[]): number | null {
  if (units.length === 0) return null;
  const counts = new Map<number, number>();
  for (const u of units) counts.set(u.weight_kg, (counts.get(u.weight_kg) ?? 0) + 1);
  let best: number | null = null, bestN = -1;
  for (const [w, n] of counts) if (n > bestN || (n === bestN && best !== null && w > best)) { best = w; bestN = n; }
  return best;
}

/** Effective RIR of a set for progression: AMRAP ⇒ 0, otherwise the recorded value (null stays null). */
export function setRir(s: Pick<SetLog, 'rir' | 'is_amrap'>): number | null {
  if (s.is_amrap) return 0;
  return s.rir;
}

/**
 * Did a human assert this set's RIR? An AMRAP set is an observation whatever the field says, because
 * it was taken to failure. Otherwise the field decides, and an absent field means observed: rows
 * written before `rir_observed` existed carry a real recorded RIR, and reading them as assumptions
 * would retroactively freeze progression on real history.
 */
export function setRirObserved(s: Pick<SetLog, 'is_amrap' | 'rir_observed'>): boolean {
  if (s.is_amrap) return true;
  return s.rir_observed ?? true;
}

export function toWorkUnits(sets: readonly SetLog[], isUnilateral: boolean): WorkUnit[] {
  const working = sets.filter((s) => !s.is_warmup).sort((a, b) => a.set_index - b.set_index || sideOrder(a.side) - sideOrder(b.side));
  if (!isUnilateral) {
    return working.map((s) => ({ set_index: s.set_index, reps: s.reps, rir: setRir(s), is_amrap: s.is_amrap, rir_observed: setRirObserved(s), weight_kg: s.weight_kg, set_ids: [s.id] }));
  }
  const groups = new Map<number, SetLog[]>();
  for (const s of working) groups.set(s.set_index, [...(groups.get(s.set_index) ?? []), s]);
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([set_index, ss]) => {
    const rirs = ss.map(setRir).filter((r): r is number => r !== null);
    return {
      set_index,
      reps: Math.min(...ss.map((s) => s.reps)),
      rir: rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null,
      is_amrap: ss.some((s) => s.is_amrap),
      rir_observed: ss.every(setRirObserved),
      weight_kg: Math.max(...ss.map((s) => s.weight_kg)),
      set_ids: ss.map((s) => s.id),
    };
  });
}

export function analyzeSession(record: ExerciseSessionRecord, isUnilateral: boolean, today: string): SessionAnalysis {
  const working_sets = record.sets.filter((s) => !s.is_warmup);
  const units = toWorkUnits(record.sets, isUnilateral);
  const done = record.workout.completed_at !== null || record.workout.date < today;
  const pain = working_sets.some((s) => s.pain_severity === 'moderate' || s.pain_severity === 'stop');
  const knownRir = units.filter((u) => u.rir !== null);
  let non_qualifying_reason: SessionAnalysis['non_qualifying_reason'] = null;
  if (!done) non_qualifying_reason = 'not_completed';
  else if (record.workout.is_compromised) non_qualifying_reason = 'workout_compromised';
  else if (pain) non_qualifying_reason = 'pain';
  else if (record.workout_exercise.is_compromised) non_qualifying_reason = 'exercise_compromised';
  else if (knownRir.length === 0) non_qualifying_reason = 'no_rir';
  const nonAmrapUnits = units.filter((u) => !u.is_amrap);
  const nonAmrapObserved = nonAmrapUnits.filter((u) => u.rir !== null && u.rir_observed);
  const te = record.workout_exercise;
  let best_e1rm: number | null = null;
  for (const s of working_sets) {
    const r = setRir(s);
    if (r === null) continue;
    const v = e1rm(s.weight_kg, s.reps, r);
    if (best_e1rm === null || v > best_e1rm) best_e1rm = v;
  }
  return {
    record,
    done,
    units,
    working_sets,
    qualifying: non_qualifying_reason === null && units.length > 0,
    non_qualifying_reason,
    weight_kg: modeWeight(units),
    reps: units.map((u) => u.reps),
    mean_rir: nonAmrapObserved.length ? nonAmrapObserved.reduce((a, u) => a + (u.rir as number), 0) / nonAmrapObserved.length : null,
    non_amrap_units: nonAmrapUnits.length,
    all_at_or_above_high: units.length > 0 && units.every((u) => u.reps >= te.target_rep_high),
    any_below_low: units.some((u) => u.reps < te.target_rep_low),
    best_e1rm,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return Math.round(weight * 100) / 100;
  return Math.round(roundHalfUp(weight / increment) * increment * 1000) / 1000;
}

function fmtReps(reps: readonly number[]): string { return reps.join(', '); }
function fmtKg(w: number | null): string { return w === null ? 'no weight set' : `${w} kg`; }
function fmtRir(r: number | null): string { return r === null ? '—' : (Math.round(r * 10) / 10).toString(); }

/** Spec §5.4 — best qualifying e1RM in the rolling window, with provenance. */
export function baselineE1rm(analyses: readonly SessionAnalysis[], today: string, windowDays = ROLLING_WINDOW_DAYS): { baseline_e1rm: number | null; baseline_set_id: string | null } {
  let best: number | null = null, bestId: string | null = null;
  for (const a of analyses) {
    if (!a.qualifying) continue;
    const age = daysBetween(a.record.workout.date, today);
    if (age < 0 || age > windowDays) continue;
    for (const s of a.working_sets) {
      const r = setRir(s);
      if (r === null) continue;
      const v = e1rm(s.weight_kg, s.reps, r);
      if (best === null || v > best) { best = v; bestId = s.id; }
    }
  }
  return { baseline_e1rm: best === null ? null : Math.round(best * 100) / 100, baseline_set_id: bestId };
}

/** Stall counter derived from stored reasons: regress_load count since the most recent progress_load (done sessions, newest first). */
export function derivedStalls(doneNewestFirst: readonly SessionAnalysis[]): number {
  let n = 0;
  for (const a of doneNewestFirst) {
    const r = a.record.workout_exercise.reason;
    if (r === 'progress_load') break;
    if (r === 'regress_load') n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// The decision procedure (spec §5.5 as resolved by the audit):
//   A  eligibility, and a constraint stops the engine here (A4):
//        A1 blocked: omit from the session
//        A2 uncleared requires_clearance: no weight, stays in session
//        A3 any other active constraint: reason constrained, no weight, stays in session
//   B  structure: ramped sets, RIR clamped into the week's range, AMRAP off on deload
//   C  load decision, first match wins:
//        C1 no L → first_time (starting load if any)
//        C2 deload → repeat L.weight, no progression
//        C3 all >= L.rep_high AND the effort test passes: progress_load (+increment, 0-increment gives progress_reps + unloadable)
//        C4 all >= L.rep_high and it does not: consolidate, and say why when effort was never reported (A2)
//        C5 any < L.rep_low in L AND in L' → regress_load (−10%, stalls+1)
//        C6 otherwise → progress_reps (+1 per unit, capped at T.rep_high)
//        C7 M ≠ L (most recent done session non-qualifying) → relabel repeat_after_compromised, stalls untouched
//   D  constraint display for A2 and A3: rep floor, tempo, notes, flag constrained. No weight is computed
//   E  stall_review when stalls ≥ 3
// L = most recent qualifying done session; L' = the qualifying one before it; M = most recent done session.
// Performance is judged against L's OWN stored targets; the output uses the current template + week.
// ---------------------------------------------------------------------------

export function prescribe(input: PrescribeInput): PrescribeResult {
  const { exercise, template, week, today } = input;
  const windowDays = input.rolling_window_days ?? ROLLING_WINDOW_DAYS;
  const env = foldConstraints(input.constraints);
  const incr = exercise.weight_increment_kg;

  const analyses = input.history
    .map((r) => analyzeSession(r, exercise.is_unilateral, today))
    .filter((a) => a.units.length > 0)
    // Newest first. Same-date sessions are ordered by completion time then id so M and L never
    // depend on the order the caller happened to pass history in.
    .sort((a, b) =>
      b.record.workout.date.localeCompare(a.record.workout.date)
      || (b.record.workout.completed_at ?? '').localeCompare(a.record.workout.completed_at ?? '')
      || b.record.workout.id.localeCompare(a.record.workout.id));
  const done = analyses.filter((a) => a.done);
  const qualifying = done.filter((a) => a.qualifying);
  const M = done[0] ?? null;
  const L = qualifying[0] ?? null;
  const L2 = qualifying[1] ?? null;
  const prevStalls = derivedStalls(done);
  const baseline = baselineE1rm(analyses, today, windowDays);

  // --- B: structure
  const target_sets = rampedTargetSets(template, week);
  const target_rir = clampTargetRir(template.rir_target, week);
  const last_set_amrap = template.last_set_amrap && !(week?.is_deload ?? false);
  let rep_low = template.rep_low;
  let rep_high = template.rep_high;
  let byset: number[] | null = null;
  let suggested: number | null = null;
  let reason: PrescriptionReason;
  let rationale: string;
  const flags: PrescriptionFlag[] = [];
  let stalls = prevStalls;
  let progressedToday = false;
  let omit = false;

  const describe = (a: SessionAnalysis) => {
    const effort = a.mean_rir === null
      ? 'with no effort reported'
      : `at effort ${fmtRir(a.mean_rir)}`;
    return `Last qualifying session ${a.record.workout.date}: ${fmtKg(a.weight_kg)} for ${fmtReps(a.reps)} reps ${effort} (target ${a.record.workout_exercise.target_rir}, range ${a.record.workout_exercise.target_rep_low} to ${a.record.workout_exercise.target_rep_high}).`;
  };
  const rangeNote = (a: SessionAnalysis) =>
    (a.record.workout_exercise.target_rep_low !== template.rep_low || a.record.workout_exercise.target_rep_high !== template.rep_high)
      ? ` Today's range is ${template.rep_low}–${template.rep_high}.` : '';

  if (env.blocked) {
    // --- A1
    reason = 'blocked';
    omit = true;
    rationale = 'Excluded from this session by an active injury constraint.';
  } else if (env.awaiting_clearance) {
    // --- A2
    reason = 'requires_clearance';
    rationale = 'Held pending physio clearance. No load is prescribed until the constraint is cleared, and sets may still be logged.';
  } else if (input.constraints.length > 0) {
    // --- A3 (amendment A4). David's ruling: "If injured let the user figure it out no recommendation
    // required." A constraint stops the engine before it computes anything, rather than letting it work
    // out a weight and then cap it. Stage B has already run, so the set count and target effort still
    // apply. Stages C and D are skipped and David sets the weight himself.
    reason = 'constrained';
    const limits: string[] = [];
    if (env.max_weight_kg !== null) limits.push(`no more than ${env.max_weight_kg} kg`);
    if (env.min_reps !== null) limits.push(`at least ${env.min_reps} reps`);
    if (env.required_tempo) limits.push(`tempo ${env.required_tempo}`);
    rationale = 'An injury constraint applies here, so I am not suggesting a weight. You pick it.';
    if (limits.length) rationale += ` Your limits are ${limits.join(', ')}.`;
  } else if (!L) {
    // --- C1
    reason = 'first_time';
    const fallback = M?.weight_kg ?? null;
    if (input.starting_load_kg !== null) {
      suggested = incr > 0 ? roundToIncrement(input.starting_load_kg, incr) : input.starting_load_kg;
      rationale = 'No qualifying history yet. Starting load {{W}} from the stored starting load.';
    } else if (fallback !== null) {
      suggested = fallback;
      rationale = `No qualifying history yet. Repeating the {{W}} used on ${M!.record.workout.date}.`;
    } else {
      rationale = 'No qualifying history yet. Set a starting load.';
    }
    if (M && !M.qualifying) rationale += ` (Most recent session ${M.record.workout.date} did not qualify: ${M.non_qualifying_reason}.)`;
  } else if (week?.is_deload) {
    // --- C2
    reason = 'deload';
    suggested = L.weight_kg;
    rationale = `Deload week ${week.week_number}: repeating the last working weight {{W}} at reduced volume (${target_sets} sets), RIR ${target_rir}. No progression evaluated.`;
  } else {
    const wL = L.weight_kg ?? 0;
    // The effort test (docs/ENGINE-RULES.md, amendment A1). Load may only go up on evidence that the
    // set was easy, never on a client's pre-filled default. It passes when at least one non-AMRAP unit
    // had its effort observed and the mean over those units is at or above the session's target, or
    // when there were no non-AMRAP units at all, since a set taken to failure is itself the evidence.
    const observedMean = L.mean_rir;
    const effortTestPasses = L.non_amrap_units === 0
      || (observedMean !== null && observedMean >= L.record.workout_exercise.target_rir);
    // Reps alone would have earned the load, and only the missing effort report is holding it back.
    // A2: that hold has to say so, otherwise the fix trades one silent failure for another.
    const withheldForEffort = L.all_at_or_above_high && !effortTestPasses && observedMean === null;
    if (L.all_at_or_above_high && effortTestPasses) {
      // --- C3
      if (incr > 0) {
        reason = 'progress_load';
        suggested = Math.round((wL + incr) * 1000) / 1000;
        progressedToday = true;
        stalls = 0;
        rationale = `${describe(L)} Every set reached the top of the range with effort in hand, so add ${incr} kg to make {{W}} and reset to ${template.rep_low} reps.${rangeNote(L)}`;
      } else {
        reason = 'progress_reps';
        suggested = wL;
        byset = L.reps.map((r) => r + 1);
        while (byset.length < target_sets) byset.push(template.rep_low);
        byset = byset.slice(0, target_sets);   // L may have run more sets than today prescribes
        rep_high = Math.max(rep_high, ...byset);
        flags.push('unloadable');
        rationale = `${describe(L)} Every set reached the top of the range but this exercise has no load increment, so add a rep per set (${fmtReps(byset)}).`;
      }
    } else if (L.all_at_or_above_high) {
      // --- C4, reached either because the effort reported was under target, or (A2) because no
      // effort was reported at all and the engine will not add load on an assumption.
      reason = 'consolidate';
      suggested = wL;
      rationale = withheldForEffort
        ? `${describe(L)} Every set reached the top of the range, so the weight is ready to go up. I am holding {{W}} until you tell me how hard a set was.${rangeNote(L)}`
        : `${describe(L)} Reps are there but effort ${fmtRir(L.mean_rir)} is under the target ${L.record.workout_exercise.target_rir}, so hold {{W}} and the same reps until it drops.${rangeNote(L)}`;
    } else if (L.any_below_low && L2 && L2.any_below_low) {
      // --- C5
      reason = 'regress_load';
      let w = roundToIncrement(wL * REGRESSION_FACTOR, incr);
      if (w >= wL && incr > 0) w = roundToIncrement(wL - incr, incr);
      suggested = Math.max(0, w);
      stalls = prevStalls + 1;
      rationale = `${describe(L)} Sets fell below the bottom of the range in two consecutive qualifying sessions (${L2.record.workout.date}: ${fmtReps(L2.reps)}), so drop about 10% to {{W}} and rebuild from ${template.rep_low} reps.`;
      if (suggested === 0 && wL === 0) rationale += ' Already at bodyweight.';
    } else {
      // --- C6
      reason = 'progress_reps';
      suggested = wL;
      byset = L.reps.map((r) => Math.min(r + 1, template.rep_high));
      while (byset.length < target_sets) byset.push(template.rep_low);
      byset = byset.slice(0, target_sets);     // L may have run more sets than today prescribes
      rationale = `${describe(L)} Not every set reached the top of the range, so hold {{W}} and target one more rep per set (${fmtReps(byset)}).${rangeNote(L)}`;
      if (L.any_below_low) rationale += ` A set fell below ${L.record.workout_exercise.target_rep_low}. A second consecutive miss will trigger a load reduction.`;
    }
    // --- C7
    if (M && M !== L) {
      reason = 'repeat_after_compromised';
      stalls = prevStalls;
      progressedToday = false;
      rationale = `Most recent session ${M.record.workout.date} did not qualify (${M.non_qualifying_reason}) and is ignored. Repeating the prescription derived from the last qualifying session: ${rationale}`;
    }
  }

  // --- D: constraint display, for A2 and A3 only. The engine no longer computes a weight for a
  // constrained exercise, so there is nothing to clamp. The rep floor, the tempo and the physio note
  // are carried through as information about the limit, not as a prescription.
  let target_tempo: string | null = null;
  if (input.constraints.length > 0 && !env.blocked) {
    if (env.min_reps !== null) {
      if (rep_low < env.min_reps) rep_low = env.min_reps;
      if (rep_high < rep_low) rep_high = rep_low;
    }
    if (env.required_tempo) target_tempo = env.required_tempo;
    flags.push('constrained');
  }

  // --- E
  if (reason === 'regress_load') rationale += ` Stall count ${stalls}.`;
  if (stalls >= STALL_REVIEW_THRESHOLD) {
    flags.push('stall_review');
    rationale += ` ${stalls} consecutive stalls, so this exercise is worth reviewing (substitution or volume).`;
  }

  rationale = rationale.split('{{W}}').join(fmtKg(suggested));

  const prescription: Prescription = {
    exercise_id: exercise.id,
    suggested_weight_kg: suggested,
    target_sets,
    target_rep_low: rep_low,
    target_rep_high: rep_high,
    target_rir,
    target_reps_by_set: byset,
    target_tempo,
    last_set_amrap,
    reason,
    rationale,
    flags,
    constraint_notes: env.notes,
    based_on_workout_id: L?.record.workout.id ?? null,
    omit,
  };

  const lastProgressed = progressedToday ? today : (done.find((a) => a.record.workout_exercise.reason === 'progress_load')?.record.workout.date ?? null);
  const next_state: ProgressionState = {
    exercise_id: exercise.id,
    working_weight_kg: suggested ?? L?.weight_kg ?? M?.weight_kg ?? input.starting_load_kg ?? 0,
    baseline_e1rm: baseline.baseline_e1rm,
    baseline_set_id: baseline.baseline_set_id,
    last_progressed_at: lastProgressed,
    consecutive_stalls: stalls,
    updated_at: `${today}T00:00:00.000Z`,
  };

  return { prescription, next_state };
}
