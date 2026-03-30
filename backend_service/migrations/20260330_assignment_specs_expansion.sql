-- Expanded assignment specification fields for admin authoring.
ALTER TABLE assignment ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE assignment ADD COLUMN IF NOT EXISTS show_explanations BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE assignment ADD COLUMN IF NOT EXISTS minimum_passing_score INTEGER;
