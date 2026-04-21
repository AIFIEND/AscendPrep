CREATE TABLE IF NOT EXISTS roleplay_assignment (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institution(id),
    created_by_user_id INTEGER NOT NULL REFERENCES "user"(id),
    roleplay_id INTEGER NOT NULL REFERENCES roleplay(id),
    assignment_type VARCHAR(20) NOT NULL DEFAULT 'full',
    drill_type VARCHAR(80),
    title VARCHAR(180) NOT NULL,
    instructions TEXT,
    due_date TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_roleplay_assignment_institution_id ON roleplay_assignment(institution_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_assignment_roleplay_id ON roleplay_assignment(roleplay_id);

CREATE TABLE IF NOT EXISTS roleplay_assignment_recipient (
    id SERIAL PRIMARY KEY,
    roleplay_assignment_id INTEGER NOT NULL REFERENCES roleplay_assignment(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id),
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    CONSTRAINT uq_roleplay_assignment_recipient UNIQUE (roleplay_assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_roleplay_assignment_recipient_user_id ON roleplay_assignment_recipient(user_id);
