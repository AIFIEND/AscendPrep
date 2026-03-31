-- Beta hardening guardrails for username uniqueness and access-code redemption integrity.
UPDATE "user" SET username = LOWER(username) WHERE username <> LOWER(username);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_user_username_lower'
  ) THEN
    CREATE UNIQUE INDEX uq_user_username_lower ON "user" (LOWER(username));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_access_code_use_count'
  ) THEN
    ALTER TABLE access_code
      ADD CONSTRAINT ck_access_code_use_count CHECK (use_count >= 0 AND max_uses >= 1 AND use_count <= max_uses);
  END IF;
END $$;
