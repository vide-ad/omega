import type { Exercise, ExerciseConstraint, Injury } from '../types.js';

/**
 * Spec §3.2 — constraints belonging to an injury that is `active` or `monitoring` apply.
 * A constraint targets either a specific exercise or a whole movement pattern.
 */
export function activeConstraintsFor(
  exercise: Pick<Exercise, 'id' | 'movement_pattern'>,
  constraints: readonly ExerciseConstraint[],
  injuries: readonly Pick<Injury, 'id' | 'status'>[],
): ExerciseConstraint[] {
  const liveInjuries = new Set(injuries.filter((i) => i.status !== 'resolved').map((i) => i.id));
  return constraints.filter((c) => {
    if (!liveInjuries.has(c.injury_id)) return false;
    if (c.exercise_id) return c.exercise_id === exercise.id;
    return c.movement_pattern !== null && c.movement_pattern === exercise.movement_pattern;
  });
}

export interface ConstraintEnvelope {
  blocked: boolean;
  /** requires_clearance on a constraint that has not been cleared (`cleared_at` null). */
  awaiting_clearance: boolean;
  max_weight_kg: number | null;   // tightest cap
  min_reps: number | null;        // highest floor
  required_tempo: string | null;  // first non-null
  notes: string[];
}

/** Fold several applicable constraints into one envelope, always taking the most restrictive value. */
export function foldConstraints(cs: readonly ExerciseConstraint[]): ConstraintEnvelope {
  const env: ConstraintEnvelope = { blocked: false, awaiting_clearance: false, max_weight_kg: null, min_reps: null, required_tempo: null, notes: [] };
  for (const c of cs) {
    env.blocked ||= c.blocked;
    env.awaiting_clearance ||= c.requires_clearance && c.cleared_at === null;
    if (c.max_weight_kg !== null) env.max_weight_kg = env.max_weight_kg === null ? c.max_weight_kg : Math.min(env.max_weight_kg, c.max_weight_kg);
    if (c.min_reps !== null) env.min_reps = env.min_reps === null ? c.min_reps : Math.max(env.min_reps, c.min_reps);
    if (c.required_tempo && !env.required_tempo) env.required_tempo = c.required_tempo;
    if (c.note) env.notes.push(c.note);
  }
  return env;
}
