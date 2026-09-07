import { z } from 'zod';
import { EQUIPMENT, MOVEMENT_PATTERNS, MUSCLE_GROUP_KEYS, parseDate } from '@omega/core';
import { validationError } from './errors.js';

// --- primitives ---------------------------------------------------------------

/** Client ids are UUIDs by convention (crypto.randomUUID) but any short opaque token is accepted so offline replay never fails on format. */
export const idSchema = z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'id must be URL-safe');

export const dateSchema = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  try { return parseDate(s).toISOString().slice(0, 10) === s; } catch { return false; }
}, 'expected a calendar date YYYY-MM-DD');

export const timestampSchema = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'expected an ISO 8601 timestamp');

export const muscleKeySchema = z.enum(MUSCLE_GROUP_KEYS as [string, ...string[]]);
export const movementPatternSchema = z.enum(MOVEMENT_PATTERNS as [string, ...string[]]);
export const equipmentSchema = z.enum(EQUIPMENT as [string, ...string[]]);
export const painSchema = z.enum(['none', 'niggle', 'moderate', 'stop']);

const nonNeg = z.number().min(0);
const posInt = z.number().int().min(1);
const nonNegInt = z.number().int().min(0);
const scale5 = z.number().int().min(1).max(5);

// --- exercises ----------------------------------------------------------------

export const creditInputSchema = z.object({
  muscle_group_key: muscleKeySchema,
  credit: z.number().min(0).max(1),
  role: z.enum(['primary', 'secondary']),
});

export const exerciseCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).default([]),
  equipment: equipmentSchema,
  movement_pattern: movementPatternSchema,
  is_unilateral: z.boolean().default(false),
  lengthened_bias: z.boolean().default(false),
  default_rep_low: posInt,
  default_rep_high: posInt,
  default_rir_target: nonNegInt.max(10),
  default_rest_seconds: nonNegInt,
  weight_increment_kg: nonNeg,
  uses_bodyweight: z.boolean().default(false),
  demo_video_url: z.string().max(2000).nullable().default(null),
  cues: z.string().max(4000).nullable().default(null),
  archived: z.boolean().default(false),
  credits: z.array(creditInputSchema).min(1),
}).strict().refine((e) => e.default_rep_high >= e.default_rep_low, { message: 'default_rep_high must be ≥ default_rep_low', path: ['default_rep_high'] });

export const exercisePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).optional(),
  equipment: equipmentSchema.optional(),
  movement_pattern: movementPatternSchema.optional(),
  is_unilateral: z.boolean().optional(),
  lengthened_bias: z.boolean().optional(),
  default_rep_low: posInt.optional(),
  default_rep_high: posInt.optional(),
  default_rir_target: nonNegInt.max(10).optional(),
  default_rest_seconds: nonNegInt.optional(),
  weight_increment_kg: nonNeg.optional(),
  uses_bodyweight: z.boolean().optional(),
  demo_video_url: z.string().max(2000).nullable().optional(),
  cues: z.string().max(4000).nullable().optional(),
  archived: z.boolean().optional(),
  credits: z.array(creditInputSchema).min(1).optional(),
}).strict();

// --- templates ----------------------------------------------------------------

export const templateExerciseInputSchema = z.object({
  exercise_id: idSchema,
  order: posInt.optional(),
  base_sets: posInt.max(20).default(3),
  is_priority: z.boolean().default(false),
  rep_low: posInt.optional(),
  rep_high: posInt.optional(),
  rir_target: nonNegInt.max(10).optional(),
  rest_seconds: nonNegInt.optional(),
  last_set_amrap: z.boolean().default(false),
  notes: z.string().max(2000).nullable().default(null),
}).strict();

export const templateCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(120),
  day_label: z.string().trim().max(40).nullable().default(null),
  order: nonNegInt.optional(),
  mesocycle_id: idSchema.nullable().default(null),
  exercises: z.array(templateExerciseInputSchema).min(1),
}).strict();

export const templatePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  day_label: z.string().trim().max(40).nullable().optional(),
  order: nonNegInt.optional(),
  mesocycle_id: idSchema.nullable().optional(),
  archived: z.boolean().optional(),
  exercises: z.array(templateExerciseInputSchema).min(1).optional(),
}).strict();

// --- mesocycles ---------------------------------------------------------------

export const mesocycleWeekSchema = z.object({
  week_number: posInt,
  is_deload: z.boolean().default(false),
  set_delta: z.number().int().default(0),
  rir_target_low: nonNegInt.max(10),
  rir_target_high: nonNegInt.max(10),
  volume_multiplier: z.number().positive().max(2).default(1),
}).strict();

export const mesocycleStatusSchema = z.enum(['planned', 'active', 'complete', 'abandoned']);

export const mesocycleCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(120),
  start_date: dateSchema,
  planned_weeks: posInt.max(52),
  deload_week: posInt.max(52),
  status: mesocycleStatusSchema.default('planned'),
  notes: z.string().max(4000).nullable().default(null),
  weeks: z.array(mesocycleWeekSchema).min(1),
}).strict().superRefine((m, ctx) => {
  if (m.deload_week > m.planned_weeks) ctx.addIssue({ code: 'custom', message: 'deload_week must be ≤ planned_weeks', path: ['deload_week'] });
  const nums = m.weeks.map((w) => w.week_number).sort((a, b) => a - b);
  const expected = Array.from({ length: m.planned_weeks }, (_, i) => i + 1);
  if (nums.length !== expected.length || nums.some((n, i) => n !== expected[i])) {
    ctx.addIssue({ code: 'custom', message: `weeks must cover week_number 1..${m.planned_weeks} exactly once`, path: ['weeks'] });
  }
});

export const mesocyclePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  start_date: dateSchema.optional(),
  planned_weeks: posInt.max(52).optional(),
  deload_week: posInt.max(52).optional(),
  status: mesocycleStatusSchema.optional(),
  notes: z.string().max(4000).nullable().optional(),
  weeks: z.array(mesocycleWeekSchema).min(1).optional(),
}).strict();

// --- workouts & sets ------------------------------------------------------------

export const workoutCreateSchema = z.object({
  id: idSchema.optional(),
  template_id: idSchema,
  date: dateSchema,
}).strict();

export const workoutPatchSchema = z.object({
  notes: z.string().max(4000).nullable().optional(),
  session_rpe: z.number().min(1).max(10).nullable().optional(),
  started_at: timestampSchema.nullable().optional(),
  completed_at: timestampSchema.nullable().optional(),
}).strict();

export const workoutExerciseAddSchema = z.object({
  id: idSchema.optional(),
  exercise_id: idSchema,
  order: posInt.optional(),
  target_sets: posInt.max(20).optional(),
  target_rep_low: posInt.optional(),
  target_rep_high: posInt.optional(),
  target_rir: nonNegInt.max(10).optional(),
  rest_seconds: nonNegInt.optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_priority: z.boolean().optional(),
  last_set_amrap: z.boolean().optional(),
}).strict();

export const sideSchema = z.enum(['bilateral', 'left', 'right']);

export const setCreateSchema = z.object({
  id: idSchema.optional(),
  workout_exercise_id: idSchema,
  set_index: posInt.max(100),
  side: sideSchema.default('bilateral'),
  is_warmup: z.boolean().default(false),
  is_amrap: z.boolean().default(false),
  weight_kg: nonNeg.max(1000),
  reps: nonNegInt.max(500),
  rir: z.number().int().min(0).max(20).nullable().default(null),
  tempo: z.string().max(20).nullable().default(null),
  rest_taken_seconds: nonNegInt.nullable().default(null),
  pain_severity: painSchema.default('none'),
  pain_note: z.string().max(2000).nullable().default(null),
  media_id: idSchema.nullable().default(null),
  completed_at: timestampSchema.optional(),
}).strict();

export const setPatchSchema = z.object({
  set_index: posInt.max(100).optional(),
  side: sideSchema.optional(),
  is_warmup: z.boolean().optional(),
  is_amrap: z.boolean().optional(),
  weight_kg: nonNeg.max(1000).optional(),
  reps: nonNegInt.max(500).optional(),
  rir: z.number().int().min(0).max(20).nullable().optional(),
  tempo: z.string().max(20).nullable().optional(),
  rest_taken_seconds: nonNegInt.nullable().optional(),
  pain_severity: painSchema.optional(),
  pain_note: z.string().max(2000).nullable().optional(),
  media_id: idSchema.nullable().optional(),
  completed_at: timestampSchema.optional(),
}).strict();

// --- readiness & cardio ---------------------------------------------------------

export const sorenessInputSchema = z.object({ muscle_group_key: muscleKeySchema, rating: scale5 }).strict();

export const readinessUpsertSchema = z.object({
  id: idSchema.optional(),
  date: dateSchema,
  bodyweight_kg: z.number().positive().max(500).nullable().default(null),
  resting_hr: z.number().int().min(20).max(250).nullable().default(null),
  sleep_hours: z.number().min(0).max(24).nullable().default(null),
  sleep_quality: scale5.nullable().default(null),
  stress: scale5.nullable().default(null),
  motivation: scale5.nullable().default(null),
  manual_compromised: z.boolean().default(false),
  notes: z.string().max(4000).nullable().default(null),
  soreness: z.array(sorenessInputSchema).optional(),
}).strict();

export const cardioCreateSchema = z.object({
  id: idSchema.optional(),
  date: dateSchema,
  type: z.enum(['run', 'bike', 'row', 'other']),
  sub_type: z.string().trim().max(60).nullable().default(null),
  duration_minutes: z.number().positive().max(1440),
  distance_km: nonNeg.max(1000).nullable().default(null),
  avg_hr: z.number().int().min(20).max(250).nullable().default(null),
  max_hr: z.number().int().min(20).max(250).nullable().default(null),
  zone_minutes: z.record(z.string().max(10), nonNeg).nullable().default(null),
  perceived_effort: z.number().int().min(1).max(10).nullable().default(null),
  source: z.enum(['manual', 'apple_health', 'import']).default('manual'),
  notes: z.string().max(4000).nullable().default(null),
}).strict();

// --- coaching writes ------------------------------------------------------------

export const volumeTargetPutSchema = z.object({
  min_sets: nonNeg.max(100),
  max_sets: nonNeg.max(100),
  priority: z.enum(['priority', 'moderate', 'maintenance']),
  active: z.boolean().default(true),
}).strict().refine((t) => t.max_sets >= t.min_sets, { message: 'max_sets must be ≥ min_sets', path: ['max_sets'] });

export const injuryStatusSchema = z.enum(['active', 'monitoring', 'resolved']);

export const injuryCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(200),
  region: z.string().trim().min(1).max(200),
  status: injuryStatusSchema.default('active'),
  started_at: z.string().min(1).max(40),
  resolved_at: z.string().max(40).nullable().default(null),
  notes: z.string().max(8000).nullable().default(null),
  physio_notes: z.string().max(8000).nullable().default(null),
}).strict();

export const injuryPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  region: z.string().trim().min(1).max(200).optional(),
  status: injuryStatusSchema.optional(),
  started_at: z.string().min(1).max(40).optional(),
  resolved_at: z.string().max(40).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  physio_notes: z.string().max(8000).nullable().optional(),
}).strict();

const constraintFields = {
  exercise_id: idSchema.nullable().default(null),
  movement_pattern: movementPatternSchema.nullable().default(null),
  max_weight_kg: nonNeg.max(1000).nullable().default(null),
  min_reps: posInt.max(100).nullable().default(null),
  required_tempo: z.string().trim().max(20).nullable().default(null),
  requires_clearance: z.boolean().default(false),
  cleared_at: timestampSchema.nullable().default(null),
  blocked: z.boolean().default(false),
  note: z.string().max(4000).nullable().default(null),
};

export const constraintCreateSchema = z.object({ id: idSchema.optional(), ...constraintFields }).strict()
  .refine((c) => c.exercise_id !== null || c.movement_pattern !== null, { message: 'exercise_id or movement_pattern is required', path: ['exercise_id'] });

export const constraintPatchSchema = z.object({
  exercise_id: idSchema.nullable().optional(),
  movement_pattern: movementPatternSchema.nullable().optional(),
  max_weight_kg: nonNeg.max(1000).nullable().optional(),
  min_reps: posInt.max(100).nullable().optional(),
  required_tempo: z.string().trim().max(20).nullable().optional(),
  requires_clearance: z.boolean().optional(),
  cleared_at: timestampSchema.nullable().optional(),
  blocked: z.boolean().optional(),
  note: z.string().max(4000).nullable().optional(),
}).strict();

// --- helpers --------------------------------------------------------------------

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw validationError('Request failed validation', r.error.issues);
  return r.data;
}

export function parseOptionalDate(raw: string | undefined, name: string): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  const r = dateSchema.safeParse(raw);
  if (!r.success) throw validationError(`${name} must be YYYY-MM-DD`);
  return r.data;
}

export function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw validationError('expected a boolean (true/false)');
}

export function parseWeeks(raw: string | undefined, fallback = 4): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 52) throw validationError('weeks must be an integer between 1 and 52');
  return n;
}
