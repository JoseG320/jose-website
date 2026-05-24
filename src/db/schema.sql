-- admins
-- Admin accounts. Made it so that a password must be changed.
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- resumes
-- Uploaded resumes. Files live on disk (a mounted volume); this table is the
-- index. Exactly one row should have is_active = true at a time.
CREATE TABLE IF NOT EXISTS resumes (
  id            SERIAL PRIMARY KEY,
  filename      TEXT NOT NULL,        -- name on disk (uuid-ish)
  original_name TEXT NOT NULL,        -- what the user uploaded it as
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  file_type     TEXT NOT NULL DEFAULT 'pdf',
  is_active     BOOLEAN NOT NULL DEFAULT false,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_active_per_type
  ON resumes (file_type) WHERE is_active = true;

-- site_settings
-- Free-form editable site settings (display name, tagline, social links, etc).
-- Editable from the admin panel without redeploying.
CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- session
-- Session store table used by connect-pg-simple.
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

-- messages
-- Viewable messages from the contact form.
CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  body       TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT false,
  verified   BOOLEAN NOT NULL DEFAULT false,
  token      TEXT UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_token_idx ON messages (token);

-- migrations
CREATE TABLE IF NOT EXISTS migrations (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
