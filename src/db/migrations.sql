-- migration: 001_add_message_verification
ALTER TABLE messages ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS messages_token_idx ON messages (token);
-- migration: 001_add_message_verification_end

-- migration: 002_verify_existing_messages
UPDATE messages SET verified = true WHERE token IS NULL AND verified = false;
-- migration: 002_verify_existing_messages_end

-- migration: 003_resume_file_type
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'pdf';
DROP INDEX IF EXISTS resumes_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_active_per_type
  ON resumes (file_type) WHERE is_active = true;
-- migration: 003_resume_file_type_end

-- migration: 004_admin_lockout
ALTER TABLE admins ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
-- migration: 004_admin_lockout_end