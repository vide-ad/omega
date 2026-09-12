-- Amendment A5 in docs/ENGINE-RULES.md. A constrained exercise gets no suggested weight (A4), which made
-- the physio's cap the only number David gets for it, and it lived nowhere but inside the rationale prose.
-- This carries it as a field alongside the other stored prescription fields. Null when no constraint sets one.
-- Existing rows stay null: the cap was never stored, and inventing one by parsing old rationale text would
-- be guessing.
ALTER TABLE workout_exercises ADD COLUMN constraint_max_weight_kg REAL;
