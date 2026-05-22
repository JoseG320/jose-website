-- admins
-- Admin accounts. For a personal portfolio you'll likely have exactly one row,
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
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
  is_active     BOOLEAN NOT NULL DEFAULT false,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_active
  ON resumes (is_active) WHERE is_active = true;

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
