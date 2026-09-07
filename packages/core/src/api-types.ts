/**
 * Shared request/response shapes for the REST API (spec §6). Both @omega/api (server) and
 * @omega/web (client) import these so the contract cannot drift silently.
 *
 * Conventions: base path `/api/v1`; bearer auth; errors `{ error: { code, message } }`;
 * dates `YYYY-MM-DD`; timestamps ISO 8601 UTC; weights kg.
 */
import type {
  CardioSession, Exercise, ExerciseConstraint, ExerciseMuscleCredit, Injury, Mesocycle, MesocycleWeek,
  MuscleGroupKey, MuscleVolumeTarget, Prescription, ProgressionState, ReadinessLog, SetLog, SorenessEntry,
  TemplateExercise, Workout, WorkoutExercise, WorkoutTemplate,
} from './types.js';
import type { WeekVolume } from './engine/volume.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ApiErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'validation_error' | 'conflict' | 'internal';

export interface ApiError {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  next_cursor: string | null;
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export interface ExerciseWithCredits extends Exercise {
  credits: ExerciseMuscleCredit[];
}

export interface ExerciseDetail extends ExerciseWithCredits {
  /** Constraints from active/monitoring injuries that apply to this exercise. */
  active_constraints: ExerciseConstraint[];
}

export type ExerciseCreate = Omit<Exercise, 'id' | 'created_at' | 'archived'> & {
  id?: string;
  archived?: boolean;
  credits: Array<Pick<ExerciseMuscleCredit, 'muscle_group_key' | 'credit' | 'role'>>;
};

export type ExercisePatch = Partial<Omit<ExerciseCreate, 'id'>>;

// ---------------------------------------------------------------------------
// Templates & mesocycles
// ---------------------------------------------------------------------------

export interface TemplateWithExercises extends WorkoutTemplate {
  exercises: Array<TemplateExercise & { exercise: Exercise }>;
}

export type TemplateExerciseInput = Omit<TemplateExercise, 'id' | 'template_id' | 'template_version'>;

export interface TemplateCreate {
  id?: string;
  name: string;
  day_label?: string | null;
  order?: number;
  mesocycle_id?: string | null;
  exercises: TemplateExerciseInput[];
}

/** PATCH replaces the exercise list when given and always creates a new version (spec principle 2). */
export interface TemplatePatch {
  name?: string;
  day_label?: string | null;
  order?: number;
  mesocycle_id?: string | null;
  archived?: boolean;
  exercises?: TemplateExerciseInput[];
}

export interface MesocycleWithWeeks extends Mesocycle {
  weeks: MesocycleWeek[];
}

export interface MesocycleCreate {
  id?: string;
  name: string;
  start_date: string;
  planned_weeks: number;
  deload_week: number;
  status?: Mesocycle['status'];
  notes?: string | null;
  weeks: Array<Omit<MesocycleWeek, 'mesocycle_id'>>;
}

export interface CurrentMesocycle {
  mesocycle: MesocycleWithWeeks;
  week_number: number | null;   // null when today is outside the block
  week: MesocycleWeek | null;
  is_deload: boolean;
}

// ---------------------------------------------------------------------------
// Workouts & sets
// ---------------------------------------------------------------------------

export interface PreviousPerformance {
  workout_id: string;
  date: string;
  sets: Array<Pick<SetLog, 'set_index' | 'side' | 'weight_kg' | 'reps' | 'rir' | 'is_warmup' | 'is_amrap'>>;
}

export interface WorkoutExerciseDetail {
  /** Carries the stored prescription fields (reason, rationale, flags, target_reps_by_set, ...). */
  workout_exercise: WorkoutExercise;
  exercise: Exercise;
  /** The same prescription as a standalone object (convenience for clients); null for ad-hoc exercises with no engine run. */
  prescription: Prescription | null;
  /** Most recent session of this exercise before this workout (any qualification), for the "previous numbers" column. */
  previous: PreviousPerformance | null;
  sets: SetLog[];
}

export interface WorkoutDetail {
  workout: Workout;
  template_name: string | null;
  exercises: WorkoutExerciseDetail[];
  /** Template exercises left out of this session because a `blocked` constraint applies (engine `omit`). */
  omitted: Array<{ exercise: Exercise; prescription: Prescription }>;
}

export interface WorkoutListItem extends Workout {
  template_name: string | null;
  exercise_count: number;
  set_count: number;
  sets?: SetLog[];               // when include_sets=true
}

export interface WorkoutCreate {
  id?: string;
  template_id: string;
  date: string;                  // YYYY-MM-DD
}

export interface WorkoutPatch {
  notes?: string | null;
  session_rpe?: number | null;
  started_at?: string | null;
  completed_at?: string | null;  // setting this recomputes is_compromised (spec §5.2)
}

/** Client-generated `id` is recommended: a repeated POST with the same id is idempotent (offline replay). */
export type SetCreate = Omit<SetLog, 'id' | 'completed_at'> & { id?: string; completed_at?: string };
export type SetPatch = Partial<Omit<SetLog, 'id' | 'workout_exercise_id'>>;

// ---------------------------------------------------------------------------
// Readiness & cardio
// ---------------------------------------------------------------------------

export interface ReadinessWithSoreness extends ReadinessLog {
  soreness: Array<Pick<SorenessEntry, 'muscle_group_key' | 'rating'>>;
}

/** Upsert by date. */
export type ReadinessUpsert = Omit<ReadinessLog, 'id'> & { id?: string; soreness?: Array<Pick<SorenessEntry, 'muscle_group_key' | 'rating'>> };

export interface ReadinessResponse {
  items: ReadinessWithSoreness[];
  rolling: {
    rhr_median_30d: number | null;
    bodyweight_median_30d: number | null;
  };
  /** Muscles trained in the last 48h, for the morning soreness form (spec §7). */
  recently_trained: MuscleGroupKey[];
}

export type CardioCreate = Omit<CardioSession, 'id'> & { id?: string };

// ---------------------------------------------------------------------------
// Coaching reads
// ---------------------------------------------------------------------------

export interface VolumeResponse {
  weeks: WeekVolume[];           // oldest → newest, always includes the current ISO week
  targets: MuscleVolumeTarget[];
}

export interface ProgressionSummaryItem {
  exercise: Pick<Exercise, 'id' | 'name' | 'movement_pattern'>;
  state: ProgressionState | null;
  next: Prescription;            // what the engine would prescribe if a session were instantiated today
  last_qualifying_date: string | null;
  sessions_in_window: number;
}

export interface ProgressionDetail extends ProgressionSummaryItem {
  history: Array<{
    workout_id: string;
    date: string;
    qualifying: boolean;
    non_qualifying_reason: string | null;
    weight_kg: number | null;
    reps: number[];
    mean_rir: number | null;
    best_e1rm: number | null;
    prescription: Prescription | null;
  }>;
}

export interface InjuryWithConstraints extends Injury {
  constraints: ExerciseConstraint[];
}

export type ConstraintCreate = Omit<ExerciseConstraint, 'id' | 'injury_id'> & { id?: string };
export type VolumeTargetPut = Omit<MuscleVolumeTarget, 'muscle_group_key'>;

export interface SummaryResponse {
  generated_at: string;
  window_weeks: number;
  mesocycle: CurrentMesocycle | null;
  volume: WeekVolume[];
  adherence: { planned_sessions: number; completed_sessions: number; by_week: Array<{ week: string; planned: number; completed: number }> };
  progression: Array<{
    exercise_id: string;
    name: string;
    working_weight_kg: number | null;
    baseline_e1rm: number | null;
    e1rm_change_pct: number | null;   // first vs last qualifying session in window
    consecutive_stalls: number;
    next_reason: Prescription['reason'];
    flags: Prescription['flags'];
  }>;
  readiness: {
    days_logged: number;
    rhr_median: number | null;
    sleep_mean: number | null;
    bodyweight_trend_kg: number | null;  // last minus first in window
    compromised_sessions: number;
  };
  cardio: { sessions: number; minutes: number; zone_minutes: Record<string, number> };
  pain_flags: Array<{ date: string; exercise_id: string; exercise_name: string; severity: SetLog['pain_severity']; note: string | null }>;
  injuries: InjuryWithConstraints[];
}
