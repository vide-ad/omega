import type {
  Exercise, ExerciseConstraint, MesocycleWeek, Prescription, PrescriptionFlag, PrescriptionReason,
  ProgressionState, SetLog, TemplateExercise, Workout, WorkoutExercise,
} from '../types.js';
import { foldConstraints } from './constraints.js';
import { daysBetween } from './dates.js';
import { e1rm } from './e1rm.js';
import { rampedTargetSets } from './mesocycle.js';

export const ROLLING_WINDOW_DAYS = 21;
export const REGRESSION_FACTOR = 0.9;
export const STALL_REVIEW_THRESHOLD = 3;

/** One past performance of an exercise: the workout it happened in, the prescription it was given, and the sets logged. */
export interface ExerciseSessionRecord {
  workout: Pick<Workout, 'id' | 'date' | 'is_compromised'>;
  workout_exercise: Pick<WorkoutExercise, 'id' | 'target_rep_low' | 'target_rep_high' | 'target_rir' | 'target_sets' | 'suggested_weight_kg'>;
  sets: readonly SetLog[];
}

export interface PrescribeInput {
  exercise: Pick<Exercise, 'id' | 'name' | 'weight_increment_kg' | 'is_unilateral'>;
  template: Pick<TemplateExercise, 'base_sets' | 'is_priority' | 'rep_low' | 'rep_high' | 'rir_target'>;
  week: MesocycleWeek | null;
  /** All past sessions of this exercise (any order). Sessions with no working sets are ignored. */
  history: readonly ExerciseSessionRecord[];
  /** Constraints that apply to this exercise right now (see `activeConstraintsFor`). */
  constraints: readonly ExerciseConstraint[];
  state: ProgressionState | null;
  today: string;
  rolling_window_days?: number;
}

export interface PrescribeResult {
  prescription: Prescription;
  next_state: ProgressionState;
  /** Provenance: the qualifying session (L) the decision was based on, if any. */
  based_on_workout_id: string | null;
}

// ---------------------------------------------------------------------------
// Session analysis
// ---------------------------------------------------------------------------

export interface SessionAnalysis {
  record: ExerciseSessionRecord;
  working: SetLog[];             // non-warmup sets, by set_index then side
  qualifying: boolean;
  non_qualifying_reason: 'workout_compromised' | 'pain' | 'no_rir' | null;
  weight_kg: number | null;      // most common working weight (ties → heaviest)
  reps: number[];                // per working set
  mean_rir: number | null;       // over working sets with a known RIR (AMRAP counts as 0)
  all_at_or_above_high: boolean;
  any_below_low: boolean;
}

function sideOrder(s: SetLog['side']): number { return s === 'left' ? 0 : s === 'right' ? 1 : 2; }

export function modeWeight(sets: readonly Pick<SetLog, 'weight_kg'>[]): number | null {
  if (sets.length === 0) return null;
  const counts = new Map<number, number>();
  for (const s of sets) counts.set(s.weight_kg, (counts.get(s.weight_kg) ?? 0) + 1);
  let best: number | null = null, bestN = -1;
  for (const [w, n] of counts) if (n > bestN || (n === bestN && best !== null && w > best)) { best = w; bestN = n; }
  return best;
}

export function setRir(s: Pick<SetLog, 'rir' | 'is_amrap'>): number | null {
  if (s.rir !== null) return s.rir;
  return s.is_amrap ? 0 : null;
}

export function analyzeSession(record: ExerciseSessionRecord, template: Pick<TemplateExercise, 'rep_low' | 'rep_high'>): SessionAnalysis {
  const working = record.sets
    .filter((s) => !s.is_warmup)
    .sort((a, b) => a.set_index - b.set_index || sideOrder(a.side) - sideOrder(b.side));
  const rirs = working.map(setRir).filter((r): r is number => r !== null);
  const pain = working.some((s) => s.pain_severity === 'moderate' || s.pain_severity === 'stop');
  let non_qualifying_reason: SessionAnalysis['non_qualifying_reason'] = null;
  if (record.workout.is_compromised) non_qualifying_reason = 'workout_compromised';
  else if (pain) non_qualifying_reason = 'pain';
  else if (rirs.length === 0) non_qualifying_reason = 'no_rir';
  const reps = working.map((s) => s.reps);
  return {
    record,
    working,
    qualifying: non_qualifying_reason === null && working.length > 0,
    non_qualifying_reason,
    weight_kg: modeWeight(working),
    reps,
    mean_rir: rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null,
    all_at_or_above_high: working.length > 0 && reps.every((r) => r >= template.rep_high),
    any_below_low: reps.some((r) => r < template.rep_low),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return Math.round(weight * 100) / 100;
  return Math.round(Math.round(weight / increment) * increment * 1000) / 1000;
}

/** Target effort for a session: the mesocycle week's RIR governs inside a block; the template's otherwise. */
export function effectiveTargetRir(template: Pick<TemplateExercise, 'rir_target'>, week: MesocycleWeek | null): number {
  return week ? week.rir_target_low : template.rir_target;
}

function fmtReps(reps: number[]): string { return reps.join(', '); }
function fmtKg(w: number | null): string { return w === null ? '—' : `${w} kg`; }
function fmtRir(r: number | null): string { return r === null ? '—' : (Math.round(r * 10) / 10).toString(); }

/** Spec §5.4 — best qualifying e1RM in the rolling window, with provenance. */
export function baselineE1rm(
  analyses: readonly SessionAnalysis[],
  today: string,
  windowDays = ROLLING_WINDOW_DAYS,
): { baseline_e1rm: number | null; baseline_set_id: string | null } {
  let best: number | null = null, bestId: string | null = null;
  for (const a of analyses) {
    if (!a.qualifying) continue;
    const age = daysBetween(a.record.workout.date, today);
    if (age < 0 || age > windowDays) continue;
    for (const s of a.working) {
      const r = setRir(s);
      if (r === null) continue;
      const v = e1rm(s.weight_kg, s.reps, r);
      if (best === null || v > best) { best = v; bestId = s.id; }
    }
  }
  return { baseline_e1rm: best === null ? null : Math.round(best * 100) / 100, baseline_set_id: bestId };
}

// ---------------------------------------------------------------------------
// The decision procedure (spec §5.5). Evaluation order, resolved so the table is consistent:
//   0. constraint blocked / requires_clearance / any constraint  → constrained (engine suppressed)
//   1. no qualifying session                                     → first_time
//   2. deload week                                               → deload
//   3. most recent session is non-qualifying                     → repeat_after_compromised (re-derive from L)
//   4. any set below rep_low in L AND in the qualifying session before it → regress_load (+stall_review at 3)
//   5. all sets ≥ rep_high AND mean RIR ≥ target                 → progress_load
//   6. all sets ≥ rep_high AND mean RIR < target                 → consolidate
//   7. otherwise (some sets below rep_high)                      → progress_reps
// ---------------------------------------------------------------------------

export function prescribe(input: PrescribeInput): PrescribeResult {
  const { exercise, template, week, state, today } = input;
  const windowDays = input.rolling_window_days ?? ROLLING_WINDOW_DAYS;
  const env = foldConstraints(input.constraints);

  const analyses = input.history
    .map((r) => analyzeSession(r, template))
    .filter((a) => a.working.length > 0)
    .sort((a, b) => b.record.workout.date.localeCompare(a.record.workout.date));
  const qualifying = analyses.filter((a) => a.qualifying);
  const mostRecent = analyses[0] ?? null;
  const L = qualifying[0] ?? null;
  const L2 = qualifying[1] ?? null;

  const target_sets = rampedTargetSets(template, week);
  const targetRir = effectiveTargetRir(template, week);
  const lastKnownWeight = state && state.working_weight_kg > 0 ? state.working_weight_kg : (L?.weight_kg ?? mostRecent?.weight_kg ?? null);
  const baseline = baselineE1rm(analyses, today, windowDays);
  const prevStalls = state?.consecutive_stalls ?? 0;

  let reason: PrescriptionReason;
  let rationale: string;
  let suggested: number | null = lastKnownWeight;
  let rep_low = template.rep_low;
  let rep_high = template.rep_high;
  let target_rir = targetRir;
  let byset: number[] | null = null;
  const flags: PrescriptionFlag[] = [];
  let stalls = prevStalls;
  let progressed = false;

  const describeL = (a: SessionAnalysis) =>
    `Last qualifying session ${a.record.workout.date}: ${fmtKg(a.weight_kg)} × ${fmtReps(a.reps)} at mean RIR ${fmtRir(a.mean_rir)} (target ${a.record.workout_exercise.target_rir}).`;

  if (env.blocked || env.requires_clearance || input.constraints.length > 0) {
    // 0. Constrained: engine suppressed (constrained exercises never qualify, spec §5.2).
    reason = 'constrained';
    flags.push('constrained');
    if (env.blocked) {
      flags.push('blocked');
      suggested = null;
      rationale = `Excluded by an active injury constraint.`;
    } else if (env.requires_clearance) {
      flags.push('requires_clearance');
      suggested = null;
      rationale = `Held pending physio clearance; not prescribed until the constraint is cleared.`;
    } else {
      if (env.max_weight_kg !== null) suggested = suggested === null ? env.max_weight_kg : Math.min(suggested, env.max_weight_kg);
      rationale = `Rehab constraint active — progression is suppressed and load is managed manually` +
        (env.max_weight_kg !== null ? ` (cap ${env.max_weight_kg} kg)` : '') +
        (env.min_reps !== null ? `, minimum ${env.min_reps} reps` : '') +
        (env.required_tempo ? `, tempo ${env.required_tempo}` : '') + '.';
    }
    if (env.min_reps !== null) { rep_low = Math.max(rep_low, env.min_reps); rep_high = Math.max(rep_high, env.min_reps); }
    if (suggested === null && !env.blocked && !env.requires_clearance) flags.push('first_time');
  } else if (!L) {
    // 1. No qualifying data.
    reason = 'first_time';
    flags.push('first_time');
    if (week?.is_deload) target_rir = week.rir_target_low;
    rationale = suggested !== null
      ? `No qualifying history yet. Starting load ${fmtKg(suggested)} taken from the stored working weight.`
      : `No qualifying history yet — set a starting load.`;
    if (mostRecent) rationale += ` (Most recent session ${mostRecent.record.workout.date} did not qualify: ${mostRecent.non_qualifying_reason}.)`;
  } else if (week?.is_deload) {
    // 2. Deload: suppress progression.
    reason = 'deload';
    target_rir = week.rir_target_low;
    rationale = `Deload week ${week.week_number}: repeating the last working weight ${fmtKg(suggested)} at half volume (${target_sets} sets), RIR ${target_rir}. No progression evaluated.`;
  } else {
    const repeatAfter = mostRecent && !mostRecent.qualifying ? mostRecent : null;
    const weightL = L.weight_kg ?? lastKnownWeight ?? 0;
    const rirOk = L.mean_rir !== null && L.mean_rir >= L.record.workout_exercise.target_rir;

    if (L.any_below_low && L2 && L2.any_below_low) {
      // 4. Two consecutive qualifying misses below the bottom of the range.
      reason = 'regress_load';
      let w = roundToIncrement(weightL * REGRESSION_FACTOR, exercise.weight_increment_kg);
      if (w >= weightL && exercise.weight_increment_kg > 0) w = roundToIncrement(weightL - exercise.weight_increment_kg, exercise.weight_increment_kg);
      suggested = Math.max(0, w);
      stalls = prevStalls + 1;
      rationale = `${describeL(L)} Sets fell below ${template.rep_low} reps in two consecutive qualifying sessions (${L2.record.workout.date}: ${fmtReps(L2.reps)}) → reduce ~10% to ${fmtKg(suggested)} and rebuild from ${template.rep_low} reps. Stall count ${stalls}.`;
      if (stalls >= STALL_REVIEW_THRESHOLD) {
        flags.push('stall_review');
        rationale += ` ${stalls} consecutive stalls — review this exercise (substitution or volume).`;
      }
    } else if (L.all_at_or_above_high && rirOk) {
      // 5. Progress load.
      if (exercise.weight_increment_kg > 0) {
        reason = 'progress_load';
        // Add one increment to the actual last weight; do not re-snap to the grid (42 + 2.5 must be 44.5, not 45).
        suggested = Math.round((weightL + exercise.weight_increment_kg) * 1000) / 1000;
        progressed = true;
        stalls = 0;
        rationale = `${describeL(L)} Every set reached ${template.rep_high} with effort in hand → +${exercise.weight_increment_kg} kg to ${fmtKg(suggested)}, reset to ${template.rep_low} reps.`;
      } else {
        reason = 'progress_reps';
        suggested = weightL;
        byset = L.reps.map((r) => r + 1);
        rep_high = Math.max(rep_high, ...byset);
        rationale = `${describeL(L)} Every set reached ${template.rep_high} but this exercise has no load increment → add a rep per set (${fmtReps(byset)}).`;
      }
    } else if (L.all_at_or_above_high) {
      // 6. Consolidate.
      reason = 'consolidate';
      suggested = weightL;
      rationale = `${describeL(L)} Reps are there but mean RIR ${fmtRir(L.mean_rir)} is under the target ${L.record.workout_exercise.target_rir} → hold ${fmtKg(suggested)} and the same reps until effort drops.`;
    } else {
      // 7. Progress reps: one more than achieved, capped at the top of the range.
      reason = 'progress_reps';
      suggested = weightL;
      byset = L.reps.map((r) => Math.min(r + 1, template.rep_high));
      rationale = `${describeL(L)} Not every set reached ${template.rep_high} → hold ${fmtKg(suggested)} and target one more rep per set (${fmtReps(byset)}).`;
      if (L.any_below_low) rationale += ` A set fell below ${template.rep_low}; a second consecutive miss will trigger a load reduction.`;
    }

    if (repeatAfter) {
      // 3. The most recent session did not qualify: repeat the prescription derived from L, and do not
      //    move the stall counter (the dip is not evidence).
      reason = 'repeat_after_compromised';
      stalls = prevStalls;
      progressed = false;
      rationale = `Most recent session ${repeatAfter.record.workout.date} did not qualify (${repeatAfter.non_qualifying_reason}) and is ignored. Repeating the prescription derived from the last qualifying session: ` + rationale;
    }
  }

  const prescription: Prescription = {
    exercise_id: exercise.id,
    suggested_weight_kg: suggested,
    target_sets,
    target_rep_low: rep_low,
    target_rep_high: rep_high,
    target_rir,
    target_reps_by_set: byset,
    required_tempo: env.required_tempo,
    reason,
    rationale,
    flags,
    constraint_notes: env.notes,
  };

  const next_state: ProgressionState = {
    exercise_id: exercise.id,
    working_weight_kg: suggested ?? lastKnownWeight ?? 0,
    baseline_e1rm: baseline.baseline_e1rm,
    baseline_set_id: baseline.baseline_set_id,
    last_progressed_at: progressed ? today : (state?.last_progressed_at ?? null),
    consecutive_stalls: stalls,
    updated_at: `${today}T00:00:00.000Z`,
  };

  return { prescription, next_state, based_on_workout_id: L?.record.workout.id ?? null };
}
