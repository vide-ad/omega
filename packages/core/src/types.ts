/**
 * Domain types for the training log. Transcribed from the v1 build spec §3 and §8.
 *
 * Conventions (spec §3):
 *  - All ids are UUID strings.
 *  - All timestamps are ISO 8601 UTC strings; calendar dates are `YYYY-MM-DD`.
 *  - All weights are stored in kg.
 */

// ---------------------------------------------------------------------------
// §3.1 Exercise library
// ---------------------------------------------------------------------------

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'other';

export const EQUIPMENT: readonly Equipment[] = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'other'];

export type MovementPattern =
  | 'squat' | 'hinge' | 'lunge' | 'horizontal_press' | 'incline_press' | 'vertical_press'
  | 'horizontal_pull' | 'vertical_pull' | 'elbow_flexion' | 'elbow_extension'
  | 'lateral_raise' | 'knee_flexion' | 'knee_extension' | 'calf' | 'core_flexion'
  | 'core_rotation' | 'core_antiextension' | 'other';

export const MOVEMENT_PATTERNS: readonly MovementPattern[] = [
  'squat', 'hinge', 'lunge', 'horizontal_press', 'incline_press', 'vertical_press',
  'horizontal_pull', 'vertical_pull', 'elbow_flexion', 'elbow_extension',
  'lateral_raise', 'knee_flexion', 'knee_extension', 'calf', 'core_flexion',
  'core_rotation', 'core_antiextension', 'other',
];

export interface Exercise {
  id: string;
  name: string;                       // "Incline Dumbbell Curl"
  aliases: string[];                  // ["incline curl"] — for search
  equipment: Equipment;
  movement_pattern: MovementPattern;
  is_unilateral: boolean;             // true → sets logged per side
  lengthened_bias: boolean;           // loads the muscle in a stretched position
  default_rep_low: number;
  default_rep_high: number;
  default_rir_target: number;
  default_rest_seconds: number;
  weight_increment_kg: number;        // smallest available jump: 2.5 barbell, 2 DB, machine-specific (0 = unloadable)
  uses_bodyweight: boolean;           // weight_kg on sets is ADDED load (chin-up, dip, ab wheel)
  demo_video_url: string | null;      // self-recorded clip
  cues: string | null;                // freeform technique notes
  archived: boolean;
  created_at: string;
}

export type MuscleGroupKey =
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'adductors'
  | 'chest_upper' | 'chest_mid' | 'lats' | 'upper_back' | 'spinal_erectors'
  | 'delts_front' | 'delts_lateral' | 'delts_rear'
  | 'biceps' | 'brachialis' | 'triceps' | 'forearms'
  | 'core_rectus' | 'core_obliques';

export const MUSCLE_GROUP_KEYS: readonly MuscleGroupKey[] = [
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors',
  'chest_upper', 'chest_mid', 'lats', 'upper_back', 'spinal_erectors',
  'delts_front', 'delts_lateral', 'delts_rear',
  'biceps', 'brachialis', 'triceps', 'forearms',
  'core_rectus', 'core_obliques',
];

export type MuscleRegion = 'lower' | 'upper_push' | 'upper_pull' | 'core';

export interface MuscleGroup {
  key: MuscleGroupKey;                // primary key, stable string
  display_name: string;
  region: MuscleRegion;
}

export type CreditRole = 'primary' | 'secondary';

export interface ExerciseMuscleCredit {
  exercise_id: string;
  muscle_group_key: MuscleGroupKey;
  credit: number;                     // 0.0–1.0, contribution of one set
  role: CreditRole;
}

// ---------------------------------------------------------------------------
// §3.2 Injury and constraints
// ---------------------------------------------------------------------------

export type InjuryStatus = 'active' | 'monitoring' | 'resolved';

export interface Injury {
  id: string;
  name: string;                       // "Right radial nerve irritation"
  region: string;                     // "right forearm / elbow"
  status: InjuryStatus;
  started_at: string;
  resolved_at: string | null;
  notes: string | null;
  physio_notes: string | null;
}

export interface ExerciseConstraint {
  id: string;
  injury_id: string;
  exercise_id: string | null;         // null + movement_pattern set → applies to pattern
  movement_pattern: MovementPattern | null;
  max_weight_kg: number | null;
  min_reps: number | null;            // force higher-rep, lighter work
  required_tempo: string | null;      // "3-0-3-0"
  requires_clearance: boolean;        // block prescription until physio signs off
  /** When non-null the clearance has been granted; other caps on this constraint still apply. */
  cleared_at: string | null;
  blocked: boolean;                   // exclude entirely
  note: string | null;
}

// ---------------------------------------------------------------------------
// §3.3 Mesocycles and templates
// ---------------------------------------------------------------------------

export type MesocycleStatus = 'planned' | 'active' | 'complete' | 'abandoned';

export interface Mesocycle {
  id: string;
  name: string;                       // "Return to training — block 1"
  start_date: string;                 // ISO date
  planned_weeks: number;              // e.g. 6
  deload_week: number;                // e.g. 6
  status: MesocycleStatus;
  notes: string | null;
}

export interface MesocycleWeek {
  mesocycle_id: string;
  week_number: number;                // 1-indexed
  is_deload: boolean;
  set_delta: number;                  // sets added per priority exercise vs template base
  rir_target_low: number;
  rir_target_high: number;
  volume_multiplier: number;          // 1.0 normal, 0.5 deload
}

export interface WorkoutTemplate {
  id: string;
  name: string;                       // "Day 1 — Quad + Pull"
  day_label: string | null;           // "Saturday"
  order: number;
  version: number;                    // increment on edit; sessions reference a version
  mesocycle_id: string | null;
  archived: boolean;
}

export interface TemplateExercise {
  id: string;
  template_id: string;
  template_version: number;
  exercise_id: string;
  order: number;
  base_sets: number;                  // week 1 set count
  is_priority: boolean;               // receives set_delta on ramp weeks
  rep_low: number;
  rep_high: number;
  rir_target: number;
  rest_seconds: number;
  last_set_amrap: boolean;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// §3.4 Sessions and sets
// ---------------------------------------------------------------------------

export interface Workout {
  id: string;
  template_id: string | null;
  template_version: number | null;
  mesocycle_id: string | null;
  week_number: number | null;
  date: string;                       // ISO date
  started_at: string | null;
  completed_at: string | null;
  readiness_id: string | null;        // link to that day's readiness log
  session_rpe: number | null;         // 1–10, whole-session subjective
  notes: string | null;
  is_compromised: boolean;            // computed at completion, see §5.2 — cached for query speed
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  order: number;
  target_sets: number;
  target_rep_low: number;
  target_rep_high: number;
  target_rir: number;
  suggested_weight_kg: number | null; // written by progression engine at instantiation
  rest_seconds: number;
  notes: string | null;
  // --- Stored prescription (engine output at instantiation; immutable history) ---
  target_reps_by_set: number[] | null;  // per-set rep targets when reason is progress_reps
  target_tempo: string | null;          // from an applicable constraint's required_tempo
  /** The physio's cap, folded across every applicable constraint (A5). Null when none sets one. */
  constraint_max_weight_kg: number | null;
  last_set_amrap: boolean;
  reason: PrescriptionReason | null;    // null for ad-hoc exercises with no engine run
  rationale: string | null;
  flags: PrescriptionFlag[];
  constraint_notes: string[];
  based_on_workout_id: string | null;   // the qualifying session (L) the decision was derived from
  /** Exercise-level compromise cache (pain moderate/stop on any set, or soreness ≥4 on a trained muscle). Set at completion. */
  is_compromised: boolean;
}

export type PainSeverity = 'none' | 'niggle' | 'moderate' | 'stop';

export const PAIN_SEVERITIES: readonly PainSeverity[] = ['none', 'niggle', 'moderate', 'stop'];

export type SetSide = 'bilateral' | 'left' | 'right';

export interface SetLog {
  id: string;
  workout_exercise_id: string;
  set_index: number;                  // 1-indexed, within the exercise
  side: SetSide;
  is_warmup: boolean;
  is_amrap: boolean;
  weight_kg: number;
  reps: number;
  rir: number | null;                 // null only if genuinely not recorded
  /**
   * Did a human assert this RIR? True when the user picked it, or the set is AMRAP (RIR 0 by
   * definition). False when a client's pre-filled default went unchallenged. Only an observed RIR
   * can justify adding load — see "The effort test" in docs/ENGINE-RULES.md.
   *
   * Optional, and absent means `true`: rows written before this field existed carry a real recorded
   * RIR, and treating them as assumptions would retroactively freeze progression on real history.
   * Only a client that knows its value was a default should send `false`.
   */
  rir_observed?: boolean;
  tempo: string | null;               // "3-0-1-0" eccentric-pause-concentric-pause
  rest_taken_seconds: number | null;  // from the timer
  pain_severity: PainSeverity;
  pain_note: string | null;
  media_id: string | null;            // future: §8
  completed_at: string;
}

// ---------------------------------------------------------------------------
// §3.5 Readiness and cardio
// ---------------------------------------------------------------------------

export interface ReadinessLog {
  id: string;
  date: string;
  bodyweight_kg: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;       // 1–5
  stress: number | null;              // 1–5
  motivation: number | null;          // 1–5
  manual_compromised: boolean;        // user override: "today was rough"
  notes: string | null;
}

export interface SorenessEntry {
  readiness_id: string;
  muscle_group_key: MuscleGroupKey;
  rating: number;                     // 1–5
}

export type CardioType = 'run' | 'bike' | 'row' | 'other';
export type CardioSource = 'manual' | 'apple_health' | 'import';

export interface CardioSession {
  id: string;
  date: string;
  type: CardioType;
  sub_type: string | null;            // "easy", "intervals", "commute"
  duration_minutes: number;
  distance_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  zone_minutes: Record<string, number> | null;  // {"z1":4,"z2":12,"z3":10,"z4":1,"z5":0}
  perceived_effort: number | null;    // 1–10
  source: CardioSource;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// §3.6 Volume targets
// ---------------------------------------------------------------------------

export type VolumePriority = 'priority' | 'moderate' | 'maintenance';

export interface MuscleVolumeTarget {
  muscle_group_key: MuscleGroupKey;
  min_sets: number;                   // per week
  max_sets: number;
  priority: VolumePriority;
  active: boolean;
}

// ---------------------------------------------------------------------------
// §3.7 Derived / cached progression state
// ---------------------------------------------------------------------------

export interface ProgressionState {
  exercise_id: string;
  working_weight_kg: number;          // current prescribed load
  baseline_e1rm: number | null;       // best qualifying e1RM in rolling window
  baseline_set_id: string | null;     // provenance
  last_progressed_at: string | null;
  consecutive_stalls: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// §5.5 / §6.3 Prescriptions (engine output). Every prescription carries a
// machine `reason` and a human `rationale`.
// ---------------------------------------------------------------------------

export type PrescriptionReason =
  | 'first_time'                // no qualifying history; suggested = starting load if one exists
  | 'requires_clearance'        // uncleared clearance-gated constraint; stays in session, no weight
  | 'constrained'               // an active constraint applies; the engine prescribes no weight (A4)
  | 'blocked'                   // constraint excludes the exercise; API omits it from the session
  | 'deload'
  | 'progress_load'
  | 'consolidate'
  | 'progress_reps'
  | 'regress_load'
  | 'repeat_after_compromised';

export const PRESCRIPTION_REASONS: readonly PrescriptionReason[] = [
  'first_time', 'requires_clearance', 'constrained', 'blocked', 'deload', 'progress_load', 'consolidate',
  'progress_reps', 'regress_load', 'repeat_after_compromised',
];

export type PrescriptionFlag =
  | 'stall_review'        // consecutive_stalls >= 3, surface to coach
  | 'constrained'         // an active ExerciseConstraint applies (cap, min reps, tempo); notes attached
  | 'unloadable';         // weight_increment_kg is 0, so load cannot progress; reps do instead

export interface Prescription {
  exercise_id: string;
  suggested_weight_kg: number | null;
  target_sets: number;
  target_rep_low: number;
  target_rep_high: number;
  target_rir: number;
  /** Per-set rep targets when the rule is `progress_reps` (spec §5.5: one more rep than achieved, per set). */
  target_reps_by_set: number[] | null;
  target_tempo: string | null;
  /**
   * The physio's cap as a number, the lowest across every constraint that applies, null when none sets
   * one. Amendment A5. A constrained exercise gets no suggested weight (A4), so this is the only number
   * David gets for it, and it has to exist somewhere a client can render without parsing prose.
   */
  constraint_max_weight_kg: number | null;
  last_set_amrap: boolean;
  reason: PrescriptionReason;
  rationale: string;
  flags: PrescriptionFlag[];
  /** Notes from any active constraint that applies (spec §3.2: surface `note` alongside the prescription). */
  constraint_notes: string[];
  based_on_workout_id: string | null;
  /** True when a `blocked` constraint applies: the API should not add this exercise to the session. */
  omit: boolean;
}

// ---------------------------------------------------------------------------
// §8 Future hook: pose metrics. Reserved now; not built in v1.
// ---------------------------------------------------------------------------

export interface MediaAsset {
  id: string;
  set_id: string;
  local_uri: string;
  captured_at: string;
  camera_position: string | null;     // "front_45_left" — standardise for comparability
  processed: boolean;
}

export interface PoseMetrics {
  media_id: string;
  set_id: string;
  reps_detected: number;
  rom_degrees_mean: number | null;
  rom_degrees_by_rep: number[] | null;
  concentric_ms_mean: number | null;
  eccentric_ms_mean: number | null;
  tempo_degradation_pct: number | null;   // change first→last rep
  path_deviation_mm: number | null;
  left_right_asymmetry_pct: number | null;
  key_joint_angles: Record<string, number[]> | null;
  model: string;                          // "movenet_thunder_v4"
  confidence_mean: number;
}
