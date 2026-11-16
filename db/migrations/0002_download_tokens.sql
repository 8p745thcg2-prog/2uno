CREATE TABLE IF NOT EXISTS download_tokens (
  token_hash      TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES contracts(id),
  expires_at      TEXT NOT NULL,
  used_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
