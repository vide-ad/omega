import type { TemplateExercise, WorkoutTemplate } from '../types.js';
import { EX, seedExerciseId } from './exercises.js';
import { SEED_MESOCYCLE_ID } from './mesocycle.js';

/** Spec §9.3 — three templates, version 1, attached to the seed mesocycle. */

function tplId(n: number): string {
  return `0000c001-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
function tplExId(t: number, order: number): string {
  return `0000c002-0000-4000-8000-${String(t * 100 + order).padStart(12, '0')}`;
}

interface Row {
  name: string;
  base_sets: number;
  reps: [number, number];
  rir: number;
  rest: number;
  priority: boolean;
  notes?: string;
}

interface TplDef {
  n: number;
  name: string;
  day_label: string;
  rows: Row[];
}

const TEMPLATE_DEFS: TplDef[] = [
  {
    n: 1, name: 'Day 1, Quad + Pull', day_label: 'Saturday',
    rows: [
      { name: EX.BACK_SQUAT,          base_sets: 4, reps: [6, 8],   rir: 2, rest: 180, priority: true },
      { name: EX.WEIGHTED_CHIN_UP,    base_sets: 3, reps: [6, 8],   rir: 2, rest: 180, priority: true },
      { name: EX.LEG_EXTENSION,       base_sets: 3, reps: [10, 12], rir: 1, rest: 120, priority: true },
      { name: EX.INCLINE_DB_CURL,     base_sets: 3, reps: [10, 12], rir: 1, rest: 90,  priority: true },
      { name: EX.CABLE_LATERAL_RAISE, base_sets: 4, reps: [12, 15], rir: 1, rest: 90,  priority: true },
      { name: EX.BENCH,               base_sets: 3, reps: [8, 10],  rir: 2, rest: 150, priority: false },
      { name: EX.AB_WHEEL,            base_sets: 3, reps: [8, 12],  rir: 2, rest: 90,  priority: false },
    ],
  },
  {
    n: 2, name: 'Day 2, Push + Isolation', day_label: 'Sunday',
    rows: [
      { name: EX.LEG_PRESS,           base_sets: 4, reps: [8, 12],  rir: 2, rest: 180, priority: true },
      { name: EX.SEATED_LEG_CURL,     base_sets: 3, reps: [10, 12], rir: 1, rest: 120, priority: false },
      { name: EX.INCLINE_DB_PRESS,    base_sets: 3, reps: [10, 12], rir: 2, rest: 150, priority: false },
      { name: EX.PREACHER_CURL,       base_sets: 3, reps: [10, 12], rir: 1, rest: 90,  priority: true },
      { name: EX.DB_LATERAL_RAISE,    base_sets: 4, reps: [12, 15], rir: 1, rest: 90,  priority: true },
      { name: EX.FACE_PULL,           base_sets: 3, reps: [15, 20], rir: 2, rest: 75,  priority: false },
      { name: EX.CABLE_CRUNCH,        base_sets: 3, reps: [12, 15], rir: 2, rest: 90,  priority: false },
    ],
  },
  {
    n: 3, name: 'Day 3, Full body top-up', day_label: 'Wednesday',
    rows: [
      { name: EX.HACK_SQUAT,          base_sets: 3, reps: [8, 10],  rir: 2, rest: 180, priority: true, notes: 'Substitute: Bulgarian Split Squat' },
      { name: EX.WEIGHTED_CHIN_UP,    base_sets: 3, reps: [8, 10],  rir: 2, rest: 180, priority: true },
      { name: EX.RDL,                 base_sets: 3, reps: [8, 10],  rir: 2, rest: 150, priority: false },
      { name: EX.LEG_EXTENSION,       base_sets: 3, reps: [10, 12], rir: 1, rest: 120, priority: true },
      { name: EX.BAYESIAN_CURL,       base_sets: 3, reps: [10, 12], rir: 1, rest: 90,  priority: true },
      { name: EX.CABLE_LATERAL_RAISE, base_sets: 3, reps: [12, 15], rir: 1, rest: 90,  priority: true },
      { name: EX.OVERHEAD_CABLE_TRICEPS, base_sets: 3, reps: [10, 12], rir: 2, rest: 90, priority: false },
      { name: EX.HANGING_LEG_RAISE,   base_sets: 3, reps: [10, 15], rir: 2, rest: 90,  priority: false },
    ],
  },
];

export const SEED_TEMPLATES: readonly WorkoutTemplate[] = TEMPLATE_DEFS.map((t) => ({
  id: tplId(t.n),
  name: t.name,
  day_label: t.day_label,
  order: t.n,
  version: 1,
  mesocycle_id: SEED_MESOCYCLE_ID,
  archived: false,
}));

export const SEED_TEMPLATE_EXERCISES: readonly TemplateExercise[] = TEMPLATE_DEFS.flatMap((t) =>
  t.rows.map((r, i) => ({
    id: tplExId(t.n, i + 1),
    template_id: tplId(t.n),
    template_version: 1,
    exercise_id: seedExerciseId(r.name),
    order: i + 1,
    base_sets: r.base_sets,
    is_priority: r.priority,
    rep_low: r.reps[0],
    rep_high: r.reps[1],
    rir_target: r.rir,
    rest_seconds: r.rest,
    last_set_amrap: false,
    notes: r.notes ?? null,
  })),
);
