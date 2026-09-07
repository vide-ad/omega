import type { MuscleGroup } from '../types.js';

/** Spec §3.1 — the fixed muscle-group taxonomy. Keys are stable primary keys. */
export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  { key: 'quads',           display_name: 'Quads',            region: 'lower' },
  { key: 'hamstrings',      display_name: 'Hamstrings',       region: 'lower' },
  { key: 'glutes',          display_name: 'Glutes',           region: 'lower' },
  { key: 'calves',          display_name: 'Calves',           region: 'lower' },
  { key: 'adductors',       display_name: 'Adductors',        region: 'lower' },
  { key: 'chest_upper',     display_name: 'Upper chest',      region: 'upper_push' },
  { key: 'chest_mid',       display_name: 'Mid chest',        region: 'upper_push' },
  { key: 'lats',            display_name: 'Lats',             region: 'upper_pull' },
  { key: 'upper_back',      display_name: 'Upper back',       region: 'upper_pull' },
  { key: 'spinal_erectors', display_name: 'Spinal erectors',  region: 'upper_pull' },
  { key: 'delts_front',     display_name: 'Front delts',      region: 'upper_push' },
  { key: 'delts_lateral',   display_name: 'Lateral delts',    region: 'upper_push' },
  { key: 'delts_rear',      display_name: 'Rear delts',       region: 'upper_pull' },
  { key: 'biceps',          display_name: 'Biceps',           region: 'upper_pull' },
  { key: 'brachialis',      display_name: 'Brachialis',       region: 'upper_pull' },
  { key: 'triceps',         display_name: 'Triceps',          region: 'upper_push' },
  { key: 'forearms',        display_name: 'Forearms',         region: 'upper_pull' },
  { key: 'core_rectus',     display_name: 'Abs (rectus)',     region: 'core' },
  { key: 'core_obliques',   display_name: 'Obliques',         region: 'core' },
];
