import type { Equipment, Exercise, ExerciseMuscleCredit, MovementPattern, MuscleGroupKey } from '../types.js';

/**
 * Spec §9.3 exercise library + muscle credits (§3.1 guidance: primary 1.0, meaningful 0.5,
 * incidental 0.25). Ids are deterministic so re-seeding is idempotent and templates can
 * reference them by constant.
 *
 * `weight_increment_kg` is the smallest jump the user's gym realistically offers:
 * barbell 2.5, heavy dumbbell 2, light dumbbell (curls, raises) 1, cable/machine stack 2.5–5,
 * pure bodyweight 0 (the engine then progresses reps, not load).
 */

const SEED_CREATED_AT = '2026-09-07T00:00:00.000Z';

function exId(n: number): string {
  return `0000e001-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

type CreditSpec = Partial<Record<MuscleGroupKey, number>>;

interface Def {
  n: number;
  name: string;
  aliases?: string[];
  equipment: Equipment;
  pattern: MovementPattern;
  unilateral?: boolean;
  lengthened?: boolean;
  reps: [number, number];
  rir?: number;
  rest?: number;
  incr: number;
  cues?: string;
  credits: CreditSpec;
}

const DEFS: Def[] = [
  // --- Lower ---------------------------------------------------------------
  { n: 1,  name: 'Barbell Back Squat', aliases: ['squat', 'back squat'], equipment: 'barbell', pattern: 'squat', reps: [6, 8], rir: 2, rest: 180, incr: 2.5,
    credits: { quads: 1, glutes: 0.5, adductors: 0.5, spinal_erectors: 0.25 } },
  { n: 2,  name: 'Leg Press', equipment: 'machine', pattern: 'squat', reps: [8, 12], rir: 2, rest: 180, incr: 5,
    credits: { quads: 1, glutes: 0.5, adductors: 0.25 } },
  { n: 3,  name: 'Hack Squat', equipment: 'machine', pattern: 'squat', reps: [8, 10], rir: 2, rest: 180, incr: 5,
    credits: { quads: 1, glutes: 0.5, adductors: 0.25 } },
  { n: 4,  name: 'Bulgarian Split Squat', aliases: ['BSS', 'rear-foot elevated split squat'], equipment: 'dumbbell', pattern: 'lunge', unilateral: true, reps: [8, 10], rir: 2, rest: 150, incr: 2,
    credits: { quads: 1, glutes: 0.5, adductors: 0.25, hamstrings: 0.25 } },
  { n: 5,  name: 'Leg Extension', aliases: ['quad extension'], equipment: 'machine', pattern: 'knee_extension', reps: [10, 12], rir: 1, rest: 120, incr: 5,
    credits: { quads: 1 } },
  { n: 6,  name: 'Seated Leg Curl', aliases: ['seated hamstring curl'], equipment: 'machine', pattern: 'knee_flexion', lengthened: true, reps: [10, 12], rir: 1, rest: 120, incr: 5,
    credits: { hamstrings: 1 } },
  { n: 7,  name: 'Lying Leg Curl', equipment: 'machine', pattern: 'knee_flexion', reps: [10, 12], rir: 1, rest: 120, incr: 5,
    credits: { hamstrings: 1 } },
  { n: 8,  name: 'Romanian Deadlift', aliases: ['RDL'], equipment: 'barbell', pattern: 'hinge', lengthened: true, reps: [8, 10], rir: 2, rest: 150, incr: 2.5,
    credits: { hamstrings: 1, glutes: 0.5, spinal_erectors: 0.5, forearms: 0.25 } },
  { n: 9,  name: 'Barbell Hip Thrust', aliases: ['hip thrust'], equipment: 'barbell', pattern: 'hinge', reps: [8, 12], rir: 2, rest: 150, incr: 5,
    credits: { glutes: 1, hamstrings: 0.25 } },
  { n: 10, name: 'Standing Calf Raise', equipment: 'machine', pattern: 'calf', lengthened: true, reps: [8, 12], rir: 1, rest: 90, incr: 5,
    credits: { calves: 1 } },
  { n: 11, name: 'Seated Calf Raise', equipment: 'machine', pattern: 'calf', reps: [10, 15], rir: 1, rest: 90, incr: 5,
    credits: { calves: 1 } },

  // --- Upper push -----------------------------------------------------------
  { n: 20, name: 'Flat Barbell Bench Press', aliases: ['bench', 'bench press'], equipment: 'barbell', pattern: 'horizontal_press', reps: [8, 10], rir: 2, rest: 150, incr: 2.5,
    credits: { chest_mid: 1, triceps: 0.5, delts_front: 0.5 } },
  { n: 21, name: 'Incline Dumbbell Press (30°)', aliases: ['incline DB press', 'incline press'], equipment: 'dumbbell', pattern: 'incline_press', reps: [10, 12], rir: 2, rest: 150, incr: 2,
    credits: { chest_upper: 1, chest_mid: 0.5, delts_front: 0.5, triceps: 0.5 } },
  { n: 22, name: 'Overhead Press', aliases: ['OHP', 'military press'], equipment: 'barbell', pattern: 'vertical_press', reps: [6, 10], rir: 2, rest: 150, incr: 2.5,
    credits: { delts_front: 1, delts_lateral: 0.5, triceps: 0.5 } },
  { n: 23, name: 'Dip', aliases: ['dips', 'weighted dip'], equipment: 'bodyweight', pattern: 'horizontal_press', reps: [8, 12], rir: 2, rest: 150, incr: 2.5,
    credits: { chest_mid: 1, triceps: 0.5, delts_front: 0.25 } },
  { n: 24, name: 'Cable Lateral Raise', equipment: 'cable', pattern: 'lateral_raise', lengthened: true, reps: [12, 15], rir: 1, rest: 90, incr: 2.5,
    credits: { delts_lateral: 1, delts_rear: 0.25 } },
  { n: 25, name: 'Dumbbell Lateral Raise', aliases: ['DB lateral raise', 'side raise'], equipment: 'dumbbell', pattern: 'lateral_raise', reps: [12, 15], rir: 1, rest: 90, incr: 1,
    credits: { delts_lateral: 1, delts_rear: 0.25 } },
  { n: 26, name: 'Overhead Cable Triceps Extension', aliases: ['overhead extension', 'cable overhead triceps'], equipment: 'cable', pattern: 'elbow_extension', lengthened: true, reps: [10, 12], rir: 2, rest: 90, incr: 2.5,
    credits: { triceps: 1 } },
  { n: 27, name: 'Triceps Pushdown', aliases: ['cable pushdown', 'rope pushdown'], equipment: 'cable', pattern: 'elbow_extension', reps: [10, 15], rir: 1, rest: 90, incr: 2.5,
    credits: { triceps: 1 } },
  { n: 28, name: 'Skull Crusher', aliases: ['lying triceps extension', 'EZ bar skull crusher'], equipment: 'barbell', pattern: 'elbow_extension', lengthened: true, reps: [8, 12], rir: 2, rest: 120, incr: 2.5,
    credits: { triceps: 1 } },

  // --- Upper pull -----------------------------------------------------------
  { n: 40, name: 'Weighted Chin-Up', aliases: ['chin-up', 'chin up', 'chins'], equipment: 'bodyweight', pattern: 'vertical_pull', reps: [6, 8], rir: 2, rest: 180, incr: 2.5,
    cues: 'Supinated grip. Log added weight only (0 = bodyweight).',
    credits: { lats: 1, biceps: 0.5, upper_back: 0.5, brachialis: 0.25 } },
  { n: 41, name: 'Lat Pulldown', aliases: ['pulldown'], equipment: 'cable', pattern: 'vertical_pull', reps: [8, 12], rir: 2, rest: 120, incr: 5,
    credits: { lats: 1, upper_back: 0.5, biceps: 0.5 } },
  { n: 42, name: 'Barbell Row', aliases: ['bent-over row'], equipment: 'barbell', pattern: 'horizontal_pull', reps: [8, 10], rir: 2, rest: 150, incr: 2.5,
    credits: { upper_back: 1, lats: 0.5, biceps: 0.25, spinal_erectors: 0.5 } },
  { n: 43, name: 'Seated Cable Row', aliases: ['cable row'], equipment: 'cable', pattern: 'horizontal_pull', reps: [10, 12], rir: 2, rest: 120, incr: 5,
    credits: { upper_back: 1, lats: 0.5, biceps: 0.25 } },
  { n: 44, name: 'Chest-Supported Dumbbell Row', aliases: ['chest supported row', 'incline DB row'], equipment: 'dumbbell', pattern: 'horizontal_pull', reps: [10, 12], rir: 2, rest: 120, incr: 2,
    credits: { upper_back: 1, lats: 0.5, biceps: 0.25, delts_rear: 0.25 } },
  { n: 45, name: 'Face Pull', equipment: 'cable', pattern: 'horizontal_pull', reps: [15, 20], rir: 2, rest: 75, incr: 2.5,
    credits: { delts_rear: 1, upper_back: 0.5 } },
  { n: 46, name: 'Reverse Pec Deck', aliases: ['rear delt fly machine', 'reverse fly'], equipment: 'machine', pattern: 'horizontal_pull', reps: [12, 15], rir: 1, rest: 90, incr: 2.5,
    credits: { delts_rear: 1, upper_back: 0.25 } },

  // --- Elbow flexion (all subject to the §9.4 rehab constraint) -------------
  { n: 60, name: 'Incline Dumbbell Curl', aliases: ['incline curl'], equipment: 'dumbbell', pattern: 'elbow_flexion', lengthened: true, reps: [10, 12], rir: 1, rest: 90, incr: 1,
    credits: { biceps: 1, brachialis: 0.25 } },
  { n: 61, name: 'Preacher Curl', aliases: ['preacher curl machine', 'seated preacher curl'], equipment: 'machine', pattern: 'elbow_flexion', lengthened: true, reps: [10, 12], rir: 1, rest: 90, incr: 2.5,
    cues: 'Seated, wider grip per physio clearance.',
    credits: { biceps: 1, brachialis: 0.5 } },
  { n: 62, name: 'Bayesian Cable Curl', aliases: ['bayesian curl', 'behind-the-body cable curl'], equipment: 'cable', pattern: 'elbow_flexion', lengthened: true, reps: [10, 12], rir: 1, rest: 90, incr: 2.5,
    credits: { biceps: 1, brachialis: 0.25 } },
  { n: 63, name: 'Machine Curl', aliases: ['bicep curl machine'], equipment: 'machine', pattern: 'elbow_flexion', reps: [10, 15], rir: 1, rest: 90, incr: 2.5,
    cues: 'Pre-injury working load 20 kg. Currently capped by rehab constraint.',
    credits: { biceps: 1, brachialis: 0.5 } },
  { n: 64, name: 'Dumbbell Hammer Curl', aliases: ['hammer curl'], equipment: 'dumbbell', pattern: 'elbow_flexion', reps: [10, 12], rir: 1, rest: 90, incr: 1,
    cues: 'Pre-injury working load 14 kg × 12. Neutral grip loads brachialis/brachioradialis — check with physio before reintroducing.',
    credits: { brachialis: 1, biceps: 0.5, forearms: 0.5 } },

  // --- Core -----------------------------------------------------------------
  { n: 80, name: 'Ab Wheel Rollout', aliases: ['ab rollout', 'ab wheel'], equipment: 'bodyweight', pattern: 'core_antiextension', reps: [8, 12], rir: 2, rest: 90, incr: 0,
    credits: { core_rectus: 1, core_obliques: 0.25, lats: 0.25 } },
  { n: 81, name: 'Cable Crunch', aliases: ['kneeling cable crunch'], equipment: 'cable', pattern: 'core_flexion', reps: [12, 15], rir: 2, rest: 90, incr: 2.5,
    credits: { core_rectus: 1, core_obliques: 0.25 } },
  { n: 82, name: 'Hanging Leg Raise', aliases: ['hanging knee raise'], equipment: 'bodyweight', pattern: 'core_flexion', reps: [10, 15], rir: 2, rest: 90, incr: 0,
    credits: { core_rectus: 1, core_obliques: 0.25, forearms: 0.25 } },
  { n: 83, name: 'Pallof Press', equipment: 'cable', pattern: 'core_rotation', reps: [10, 15], rir: 2, rest: 60, incr: 2.5,
    credits: { core_obliques: 1, core_rectus: 0.25 } },
];

function primaryKey(credits: CreditSpec): MuscleGroupKey {
  let best: MuscleGroupKey | null = null;
  let bestVal = -1;
  for (const [k, v] of Object.entries(credits) as Array<[MuscleGroupKey, number]>) {
    if (v > bestVal) { best = k; bestVal = v; }
  }
  if (!best) throw new Error('exercise without credits');
  return best;
}

export const SEED_EXERCISES: readonly Exercise[] = DEFS.map((d) => ({
  id: exId(d.n),
  name: d.name,
  aliases: d.aliases ?? [],
  equipment: d.equipment,
  movement_pattern: d.pattern,
  is_unilateral: d.unilateral ?? false,
  lengthened_bias: d.lengthened ?? false,
  default_rep_low: d.reps[0],
  default_rep_high: d.reps[1],
  default_rir_target: d.rir ?? 2,
  default_rest_seconds: d.rest ?? 120,
  weight_increment_kg: d.incr,
  demo_video_url: null,
  cues: d.cues ?? null,
  archived: false,
  created_at: SEED_CREATED_AT,
}));

export const SEED_MUSCLE_CREDITS: readonly ExerciseMuscleCredit[] = DEFS.flatMap((d) => {
  const primary = primaryKey(d.credits);
  return (Object.entries(d.credits) as Array<[MuscleGroupKey, number]>).map(([muscle_group_key, credit]) => ({
    exercise_id: exId(d.n),
    muscle_group_key,
    credit,
    role: muscle_group_key === primary ? 'primary' as const : 'secondary' as const,
  }));
});

/** Lookup by canonical name (used by the template seed). Throws on unknown names so seed drift fails loudly. */
export function seedExerciseId(name: string): string {
  const d = DEFS.find((x) => x.name === name);
  if (!d) throw new Error(`Unknown seed exercise: ${name}`);
  return exId(d.n);
}

/** Names as constants for template seeding. */
export const EX = {
  BACK_SQUAT: 'Barbell Back Squat',
  LEG_PRESS: 'Leg Press',
  HACK_SQUAT: 'Hack Squat',
  BULGARIAN_SPLIT_SQUAT: 'Bulgarian Split Squat',
  LEG_EXTENSION: 'Leg Extension',
  SEATED_LEG_CURL: 'Seated Leg Curl',
  RDL: 'Romanian Deadlift',
  BENCH: 'Flat Barbell Bench Press',
  INCLINE_DB_PRESS: 'Incline Dumbbell Press (30°)',
  CABLE_LATERAL_RAISE: 'Cable Lateral Raise',
  DB_LATERAL_RAISE: 'Dumbbell Lateral Raise',
  OVERHEAD_CABLE_TRICEPS: 'Overhead Cable Triceps Extension',
  WEIGHTED_CHIN_UP: 'Weighted Chin-Up',
  FACE_PULL: 'Face Pull',
  INCLINE_DB_CURL: 'Incline Dumbbell Curl',
  PREACHER_CURL: 'Preacher Curl',
  BAYESIAN_CURL: 'Bayesian Cable Curl',
  MACHINE_CURL: 'Machine Curl',
  AB_WHEEL: 'Ab Wheel Rollout',
  CABLE_CRUNCH: 'Cable Crunch',
  HANGING_LEG_RAISE: 'Hanging Leg Raise',
} as const;
