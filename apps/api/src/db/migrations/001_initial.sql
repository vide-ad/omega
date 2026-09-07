-- 001_initial: every table from spec §3 plus the §8 reserved tables.
-- Conventions: ids are UUID TEXT; booleans are INTEGER 0/1; arrays/objects are JSON TEXT;
-- dates are 'YYYY-MM-DD' TEXT; timestamps are ISO 8601 UTC TEXT.

CREATE TABLE IF NOT EXISTS muscle_groups (
  key           TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  region        TEXT NOT NULL CHECK (region IN ('lower','upper_push','upper_pull','core'))
);

CREATE TABLE IF NOT EXISTS exercises (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  aliases              TEXT NOT NULL DEFAULT '[]',
  equipment            TEXT NOT NULL,
  movement_pattern     TEXT NOT NULL,
  is_unilateral        INTEGER NOT NULL DEFAULT 0,
  lengthened_bias      INTEGER NOT NULL DEFAULT 0,
  default_rep_low      INTEGER NOT NULL,
  default_rep_high     INTEGER NOT NULL,
  default_rir_target   INTEGER NOT NULL,
  default_rest_seconds INTEGER NOT NULL,
  weight_increment_kg  REAL NOT NULL,
  demo_video_url       TEXT,
  cues                 TEXT,
  archived             INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
CREATE INDEX IF NOT EXISTS idx_exercises_pattern ON exercises(movement_pattern);

CREATE TABLE IF NOT EXISTS exercise_muscle_credits (
  exercise_id       TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_group_key  TEXT NOT NULL REFERENCES muscle_groups(key),
  credit            REAL NOT NULL CHECK (credit >= 0 AND credit <= 1),
  role              TEXT NOT NULL CHECK (role IN ('primary','secondary')),
  PRIMARY KEY (exercise_id, muscle_group_key)
);
CREATE INDEX IF NOT EXISTS idx_credits_muscle ON exercise_muscle_credits(muscle_group_key);

CREATE TABLE IF NOT EXISTS injuries (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  region        TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('active','monitoring','resolved')),
  started_at    TEXT NOT NULL,
  resolved_at   TEXT,
  notes         TEXT,
  physio_notes  TEXT
);

CREATE TABLE IF NOT EXISTS exercise_constraints (
  id                  TEXT PRIMARY KEY,
  injury_id           TEXT NOT NULL REFERENCES injuries(id) ON DELETE CASCADE,
  exercise_id         TEXT REFERENCES exercises(id) ON DELETE CASCADE,
  movement_pattern    TEXT,
  max_weight_kg       REAL,
  min_reps            INTEGER,
  required_tempo      TEXT,
  requires_clearance  INTEGER NOT NULL DEFAULT 0,
  blocked             INTEGER NOT NULL DEFAULT 0,
  note                TEXT
);
CREATE INDEX IF NOT EXISTS idx_constraints_injury ON exercise_constraints(injury_id);
CREATE INDEX IF NOT EXISTS idx_constraints_exercise ON exercise_constraints(exercise_id);

CREATE TABLE IF NOT EXISTS mesocycles (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  start_date     TEXT NOT NULL,
  planned_weeks  INTEGER NOT NULL,
  deload_week    INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('planned','active','complete','abandoned')),
  notes          TEXT
);
CREATE INDEX IF NOT EXISTS idx_mesocycles_status ON mesocycles(status);

CREATE TABLE IF NOT EXISTS mesocycle_weeks (
  mesocycle_id       TEXT NOT NULL REFERENCES mesocycles(id) ON DELETE CASCADE,
  week_number        INTEGER NOT NULL,
  is_deload          INTEGER NOT NULL DEFAULT 0,
  set_delta          INTEGER NOT NULL DEFAULT 0,
  rir_target_low     INTEGER NOT NULL,
  rir_target_high    INTEGER NOT NULL,
  volume_multiplier  REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (mesocycle_id, week_number)
);

-- The template row always holds the LATEST version. Older versions are kept as immutable
-- history in template_versions (name/day_label snapshot) + template_exercises (rows per version).
CREATE TABLE IF NOT EXISTS workout_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  day_label     TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  version       INTEGER NOT NULL DEFAULT 1,
  mesocycle_id  TEXT REFERENCES mesocycles(id) ON DELETE SET NULL,
  archived      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_versions (
  template_id  TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  day_label    TEXT,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (template_id, version)
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id                TEXT PRIMARY KEY,
  template_id       TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  template_version  INTEGER NOT NULL,
  exercise_id       TEXT NOT NULL REFERENCES exercises(id),
  "order"           INTEGER NOT NULL,
  base_sets         INTEGER NOT NULL,
  is_priority       INTEGER NOT NULL DEFAULT 0,
  rep_low           INTEGER NOT NULL,
  rep_high          INTEGER NOT NULL,
  rir_target        INTEGER NOT NULL,
  rest_seconds      INTEGER NOT NULL,
  last_set_amrap    INTEGER NOT NULL DEFAULT 0,
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_template_exercises_version ON template_exercises(template_id, template_version, "order");
CREATE INDEX IF NOT EXISTS idx_template_exercises_exercise ON template_exercises(exercise_id);

CREATE TABLE IF NOT EXISTS readiness_logs (
  id                  TEXT PRIMARY KEY,
  date                TEXT NOT NULL,
  bodyweight_kg       REAL,
  resting_hr          INTEGER,
  sleep_hours         REAL,
  sleep_quality       INTEGER,
  stress              INTEGER,
  motivation          INTEGER,
  manual_compromised  INTEGER NOT NULL DEFAULT 0,
  notes               TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_readiness_date ON readiness_logs(date);

CREATE TABLE IF NOT EXISTS soreness_entries (
  readiness_id      TEXT NOT NULL REFERENCES readiness_logs(id) ON DELETE CASCADE,
  muscle_group_key  TEXT NOT NULL REFERENCES muscle_groups(key),
  rating            INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  PRIMARY KEY (readiness_id, muscle_group_key)
);

CREATE TABLE IF NOT EXISTS workouts (
  id                TEXT PRIMARY KEY,
  template_id       TEXT REFERENCES workout_templates(id) ON DELETE SET NULL,
  template_version  INTEGER,
  mesocycle_id      TEXT REFERENCES mesocycles(id) ON DELETE SET NULL,
  week_number       INTEGER,
  date              TEXT NOT NULL,
  started_at        TEXT,
  completed_at      TEXT,
  readiness_id      TEXT REFERENCES readiness_logs(id) ON DELETE SET NULL,
  session_rpe       REAL,
  notes             TEXT,
  is_compromised    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date, id);
CREATE INDEX IF NOT EXISTS idx_workouts_template ON workouts(template_id);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id                    TEXT PRIMARY KEY,
  workout_id            TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id           TEXT NOT NULL REFERENCES exercises(id),
  "order"               INTEGER NOT NULL,
  target_sets           INTEGER NOT NULL,
  target_rep_low        INTEGER NOT NULL,
  target_rep_high       INTEGER NOT NULL,
  target_rir            INTEGER NOT NULL,
  suggested_weight_kg   REAL,
  rest_seconds          INTEGER NOT NULL,
  notes                 TEXT,
  prescription          TEXT,             -- JSON Prescription from the engine, null for hand-added rows without one
  based_on_workout_id   TEXT REFERENCES workouts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id, "order");
CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise ON workout_exercises(exercise_id);

CREATE TABLE IF NOT EXISTS set_logs (
  id                    TEXT PRIMARY KEY,
  workout_exercise_id   TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_index             INTEGER NOT NULL,
  side                  TEXT NOT NULL DEFAULT 'bilateral' CHECK (side IN ('bilateral','left','right')),
  is_warmup             INTEGER NOT NULL DEFAULT 0,
  is_amrap              INTEGER NOT NULL DEFAULT 0,
  weight_kg             REAL NOT NULL,
  reps                  INTEGER NOT NULL,
  rir                   INTEGER,
  tempo                 TEXT,
  rest_taken_seconds    INTEGER,
  pain_severity         TEXT NOT NULL DEFAULT 'none' CHECK (pain_severity IN ('none','niggle','moderate','stop')),
  pain_note             TEXT,
  media_id              TEXT,             -- future §8; no FK to avoid a cycle with media_assets
  completed_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_set_logs_workout_exercise ON set_logs(workout_exercise_id, set_index);
CREATE INDEX IF NOT EXISTS idx_set_logs_completed_at ON set_logs(completed_at);
CREATE INDEX IF NOT EXISTS idx_set_logs_pain ON set_logs(pain_severity);

CREATE TABLE IF NOT EXISTS cardio_sessions (
  id                 TEXT PRIMARY KEY,
  date               TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('run','bike','row','other')),
  sub_type           TEXT,
  duration_minutes   REAL NOT NULL,
  distance_km        REAL,
  avg_hr             INTEGER,
  max_hr             INTEGER,
  zone_minutes       TEXT,               -- JSON object
  perceived_effort   INTEGER,
  source             TEXT NOT NULL CHECK (source IN ('manual','apple_health','import')),
  notes              TEXT
);
CREATE INDEX IF NOT EXISTS idx_cardio_date ON cardio_sessions(date);

CREATE TABLE IF NOT EXISTS muscle_volume_targets (
  muscle_group_key  TEXT PRIMARY KEY REFERENCES muscle_groups(key),
  min_sets          INTEGER NOT NULL,
  max_sets          INTEGER NOT NULL,
  priority          TEXT NOT NULL CHECK (priority IN ('priority','moderate','maintenance')),
  active            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS progression_state (
  exercise_id         TEXT PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
  working_weight_kg   REAL NOT NULL DEFAULT 0,
  baseline_e1rm       REAL,
  baseline_set_id     TEXT,
  last_progressed_at  TEXT,
  consecutive_stalls  INTEGER NOT NULL DEFAULT 0,
  updated_at          TEXT NOT NULL
);

-- §8 reserved: created now, unused in v1.
CREATE TABLE IF NOT EXISTS media_assets (
  id               TEXT PRIMARY KEY,
  set_id           TEXT NOT NULL REFERENCES set_logs(id) ON DELETE CASCADE,
  local_uri        TEXT NOT NULL,
  captured_at      TEXT NOT NULL,
  camera_position  TEXT,
  processed        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_media_assets_set ON media_assets(set_id);

CREATE TABLE IF NOT EXISTS pose_metrics (
  media_id                   TEXT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  set_id                     TEXT NOT NULL REFERENCES set_logs(id) ON DELETE CASCADE,
  reps_detected              INTEGER NOT NULL,
  rom_degrees_mean           REAL,
  rom_degrees_by_rep         TEXT,        -- JSON number[]
  concentric_ms_mean         REAL,
  eccentric_ms_mean          REAL,
  tempo_degradation_pct      REAL,
  path_deviation_mm          REAL,
  left_right_asymmetry_pct   REAL,
  key_joint_angles           TEXT,        -- JSON Record<string, number[]>
  model                      TEXT NOT NULL,
  confidence_mean            REAL NOT NULL
);
