-- Administratoriaus portalas: administratoriai ir dviejų žingsnių sesijos
CREATE TABLE IF NOT EXISTS admin_users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  totp_secret_enc  TEXT,
  totp_pending_enc TEXT,
  totp_last_step   INTEGER,
  failed_logins    INTEGER NOT NULL DEFAULT 0,
  locked_until     TEXT,
  last_login_at    TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE sessions ADD COLUMN mfa_ok INTEGER NOT NULL DEFAULT 1;
