-- Assignment layer and quiz-attempt linkage.
CREATE TABLE IF NOT EXISTS assignment (
  id INTEGER PRIMARY KEY,
  institution_id INTEGER NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  categories JSON NOT NULL DEFAULT '[]',
  difficulties JSON NOT NULL DEFAULT '[]',
  question_count INTEGER NOT NULL DEFAULT 20,
  due_date DATETIME,
  time_limit_minutes INTEGER,
  mode VARCHAR(20) NOT NULL DEFAULT 'practice',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY(institution_id) REFERENCES institution(id),
  FOREIGN KEY(created_by_user_id) REFERENCES "user"(id)
);

CREATE TABLE IF NOT EXISTS assignment_recipient (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(assignment_id) REFERENCES assignment(id),
  FOREIGN KEY(user_id) REFERENCES "user"(id),
  UNIQUE(assignment_id, user_id)
);

ALTER TABLE quiz_attempt ADD COLUMN IF NOT EXISTS assignment_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_quiz_attempt_assignment_id ON quiz_attempt(assignment_id);
CREATE INDEX IF NOT EXISTS ix_assignment_institution_id ON assignment(institution_id);
CREATE INDEX IF NOT EXISTS ix_assignment_recipient_assignment_id ON assignment_recipient(assignment_id);
CREATE INDEX IF NOT EXISTS ix_assignment_recipient_user_id ON assignment_recipient(user_id);
