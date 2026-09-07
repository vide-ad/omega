import { EX, seedExerciseId } from './exercises.js';

/**
 * Spec §9.5 — starting loads after ~4 weeks off (≈70% of pre-break). Seeded into
 * ProgressionState.working_weight_kg; the engine uses it as `starting_load_kg` when an
 * exercise has no qualifying history. 42 kg is not on the 2.5 kg barbell grid, so the
 * engine rounds it to 42.5. Machine/Preacher Curl's 20 kg pre-break load is superseded by
 * the elbow_flexion constraint (max 5 kg), so they are seeded at the cap.
 */
export const SEED_RESTART_LOADS: ReadonlyArray<{ exercise_id: string; working_weight_kg: number; note: string }> = [
  { exercise_id: seedExerciseId(EX.BENCH), working_weight_kg: 42, note: 'Pre-break 60 kg; restart at ~70% (engine rounds to 42.5).' },
  { exercise_id: seedExerciseId(EX.MACHINE_CURL), working_weight_kg: 5, note: 'Pre-break 20 kg; capped at 5 kg by rehab constraint.' },
  { exercise_id: seedExerciseId(EX.PREACHER_CURL), working_weight_kg: 5, note: 'Capped at 5 kg by rehab constraint.' },
];
