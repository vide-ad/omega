import type { ExerciseConstraint, Injury } from '../types.js';

/** Spec §9.4 — the active injury and its two pattern-level constraints. */
export const SEED_INJURY_ID = '0000d001-0000-4000-8000-000000000001';

export const SEED_INJURY: Injury = {
  id: SEED_INJURY_ID,
  name: 'Right radial nerve irritation',
  region: 'right forearm / elbow',
  status: 'active',
  started_at: '2026-08-01',
  resolved_at: null,
  notes: 'Brachioradialis tightness preceded onset. Physio has cleared seated curls with a wider grip. Pre-injury working loads: hammer curl 14kg × 12, machine curl 20kg.',
  physio_notes: null,
};

export const SEED_CONSTRAINTS: readonly ExerciseConstraint[] = [
  {
    id: '0000d101-0000-4000-8000-000000000001',
    injury_id: SEED_INJURY_ID,
    exercise_id: null,
    movement_pattern: 'elbow_flexion',
    max_weight_kg: 5,
    min_reps: 15,
    required_tempo: '3-0-3-0',
    requires_clearance: false,
    cleared_at: null,
    blocked: false,
    note: 'Rehab phase. Seated only, avoid narrow grip. Escalate ~1kg per 2 pain-free weeks. Stop on any tingling or numbness.',
  },
  {
    id: '0000d101-0000-4000-8000-000000000002',
    injury_id: SEED_INJURY_ID,
    exercise_id: null,
    movement_pattern: 'vertical_pull',
    max_weight_kg: null,
    min_reps: null,
    required_tempo: null,
    requires_clearance: true,
    cleared_at: null,
    blocked: false,
    note: 'Bodyweight chin-ups are a far heavier elbow-flexion load than rehab curls. Confirm with physio before reintroducing.',
  },
];
