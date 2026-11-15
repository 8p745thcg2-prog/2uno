-- Laukiančiųjų sąrašas („Netrukus“ puslapis): el. paštas patvirtinamas nuoroda (dvigubas patvirtinimas).
CREATE TABLE IF NOT EXISTS waitlist (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  token_hash      TEXT,                         -- patvirtinimo nuorodos žetono maiša
  token_expires_at TEXT,
  last_mail_at    TEXT,
  confirmed_at    TEXT,
  unsubscribed_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_waitlist_token ON waitlist(token_hash);
