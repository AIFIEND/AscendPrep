-- Adds optional account type support, secret access codes, and gamification tables.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS account_type VARCHAR(24) NOT NULL DEFAULT 'institution';

-- Backfill legacy superadmin column naming if old schema used is_super_admin.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='user' AND column_name='is_super_admin'
  ) THEN
    UPDATE "user"
      SET is_superadmin = COALESCE(is_superadmin, is_super_admin, FALSE)
      WHERE is_superadmin IS NULL OR is_superadmin = FALSE;
  END IF;
END $$;

UPDATE "user" SET is_admin = FALSE WHERE is_admin IS NULL;
UPDATE "user" SET is_superadmin = FALSE WHERE is_superadmin IS NULL;
UPDATE "user" SET is_active = TRUE WHERE is_active IS NULL;
UPDATE "user" SET account_type = 'institution' WHERE account_type IS NULL;

CREATE TABLE IF NOT EXISTS access_code (
  id INTEGER PRIMARY KEY,
  code_hash VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  redeemed_at DATETIME,
  redeemed_by_user_id INTEGER,
  created_by_user_id INTEGER,
  FOREIGN KEY(redeemed_by_user_id) REFERENCES "user"(id),
  FOREIGN KEY(created_by_user_id) REFERENCES "user"(id)
);

CREATE TABLE IF NOT EXISTS user_gamification (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  xp INTEGER NOT NULL DEFAULT 0,
  total_questions_answered INTEGER NOT NULL DEFAULT 0,
  total_correct_answers INTEGER NOT NULL DEFAULT 0,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  best_streak_days INTEGER NOT NULL DEFAULT 0,
  last_practice_date DATE,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES "user"(id)
);

CREATE TABLE IF NOT EXISTS user_badge (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  badge_key VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL,
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES "user"(id),
  UNIQUE(user_id, badge_key)
);
