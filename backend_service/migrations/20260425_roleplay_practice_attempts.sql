CREATE TABLE IF NOT EXISTS roleplay_practice_attempt (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    roleplay_id INTEGER NOT NULL REFERENCES roleplays(id),
    roleplay_assignment_id INTEGER REFERENCES roleplay_assignment(id),
    score INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    answers_json JSONB NOT NULL,
    results_by_skill_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roleplay_practice_attempt_user_id ON roleplay_practice_attempt(user_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_practice_attempt_roleplay_id ON roleplay_practice_attempt(roleplay_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_practice_attempt_completed_at ON roleplay_practice_attempt(completed_at DESC);
