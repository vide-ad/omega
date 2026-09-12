/**
 * Strong exercise names, mapped onto the Omega library. Checked in as data so the mapping is reviewable
 * and a wrong line is a one line fix rather than a code change.
 *
 * Strong names exercises as `Movement (Equipment)`. Omega names them naturally. An exact match reaches
 * about seven of the exercises David trains, so the rest need a table.
 *
 * Two kinds of entry, and the distinction matters. Lines marked "seen" appear in the real export, which
 * chalk analysed on 11 September 2026 and reproduced in fixtures/strong-sample.csv. Lines marked "stock"
 * are Strong's own library names for exercises Omega seeds, and have not yet been confirmed against
 * David's file. `--dry-run` prints every mapping it would use, so a wrong stock line is visible before a
 * single row is written. Correct it here, or override it with `--map <file>`.
 *
 * Only exact, trimmed names match. Nothing fuzzy, because a fuzzy match that lands on the wrong exercise
 * silently merges two histories.
 */
export const STRONG_TO_OMEGA: Readonly<Record<string, string>> = {
  // seen in the export
  'Bench Press (Barbell)': 'Flat Barbell Bench Press',
  'Squat (Barbell)': 'Barbell Back Squat',
  'Chin Up': 'Weighted Chin-Up',
  'Ab Wheel': 'Ab Wheel Rollout',
  'Preacher Curl (Machine)': 'Preacher Curl',

  // Strong stock names for the rest of the seeded library
  'Leg Press': 'Leg Press',
  'Hack Squat': 'Hack Squat',
  'Bulgarian Split Squat': 'Bulgarian Split Squat',
  'Leg Extension (Machine)': 'Leg Extension',
  'Seated Leg Curl (Machine)': 'Seated Leg Curl',
  'Lying Leg Curl (Machine)': 'Lying Leg Curl',
  'Romanian Deadlift (Barbell)': 'Romanian Deadlift',
  'Hip Thrust (Barbell)': 'Barbell Hip Thrust',
  'Standing Calf Raise (Machine)': 'Standing Calf Raise',
  'Seated Calf Raise (Machine)': 'Seated Calf Raise',
  'Incline Bench Press (Dumbbell)': 'Incline Dumbbell Press (30°)',
  'Overhead Press (Barbell)': 'Overhead Press',
  'Dip': 'Dip',
  'Lateral Raise (Cable)': 'Cable Lateral Raise',
  'Lateral Raise (Dumbbell)': 'Dumbbell Lateral Raise',
  'Triceps Extension (Cable)': 'Overhead Cable Triceps Extension',
  'Triceps Pushdown (Cable)': 'Triceps Pushdown',
  'Skullcrusher (Barbell)': 'Skull Crusher',
  'Lat Pulldown (Cable)': 'Lat Pulldown',
  'Bent Over Row (Barbell)': 'Barbell Row',
  'Seated Row (Cable)': 'Seated Cable Row',
  'Chest Supported Row (Dumbbell)': 'Chest-Supported Dumbbell Row',
  'Face Pull (Cable)': 'Face Pull',
  'Reverse Fly (Machine)': 'Reverse Pec Deck',
  'Incline Curl (Dumbbell)': 'Incline Dumbbell Curl',
  'Bicep Curl (Machine)': 'Machine Curl',
  'Hammer Curl (Dumbbell)': 'Dumbbell Hammer Curl',
  'Cable Crunch': 'Cable Crunch',
  'Hanging Leg Raise': 'Hanging Leg Raise',
  'Pallof Press': 'Pallof Press',
};

/** Strong names whose rows are cardio sessions rather than strength sets, and the Omega cardio type. */
export const STRONG_CARDIO: Readonly<Record<string, 'run' | 'bike' | 'row' | 'other'>> = {
  'Rowing (Machine)': 'row',
  'Cycling': 'bike',
  'Cycling (Indoor)': 'bike',
  'Running': 'run',
  'Running (Treadmill)': 'run',
  'Elliptical Machine': 'other',
  'Stair Machine': 'other',
  'Plank': 'other',
};
