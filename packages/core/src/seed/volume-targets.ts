import type { MuscleVolumeTarget } from '../types.js';

/** Spec §9.1 — weekly hard-set targets. Muscles not listed have no active target. */
export const VOLUME_TARGETS: readonly MuscleVolumeTarget[] = [
  { muscle_group_key: 'quads',         min_sets: 15, max_sets: 20, priority: 'priority',    active: true },
  { muscle_group_key: 'biceps',        min_sets: 12, max_sets: 15, priority: 'priority',    active: true },
  { muscle_group_key: 'brachialis',    min_sets: 4,  max_sets: 8,  priority: 'priority',    active: true },
  { muscle_group_key: 'delts_lateral', min_sets: 10, max_sets: 15, priority: 'priority',    active: true },
  { muscle_group_key: 'lats',          min_sets: 8,  max_sets: 12, priority: 'moderate',    active: true },
  { muscle_group_key: 'upper_back',    min_sets: 6,  max_sets: 10, priority: 'moderate',    active: true },
  { muscle_group_key: 'hamstrings',    min_sets: 6,  max_sets: 10, priority: 'moderate',    active: true },
  { muscle_group_key: 'triceps',       min_sets: 6,  max_sets: 10, priority: 'moderate',    active: true },
  { muscle_group_key: 'delts_rear',    min_sets: 4,  max_sets: 6,  priority: 'moderate',    active: true },
  { muscle_group_key: 'core_rectus',   min_sets: 6,  max_sets: 10, priority: 'moderate',    active: true },
  { muscle_group_key: 'core_obliques', min_sets: 4,  max_sets: 8,  priority: 'moderate',    active: true },
  { muscle_group_key: 'chest_mid',     min_sets: 4,  max_sets: 6,  priority: 'maintenance', active: true },
  { muscle_group_key: 'chest_upper',   min_sets: 3,  max_sets: 5,  priority: 'maintenance', active: true },
  { muscle_group_key: 'glutes',        min_sets: 4,  max_sets: 8,  priority: 'maintenance', active: true },
  { muscle_group_key: 'calves',        min_sets: 0,  max_sets: 4,  priority: 'maintenance', active: true },
];
