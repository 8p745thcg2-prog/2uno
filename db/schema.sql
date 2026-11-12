-- 2uno.lt duomenų bazės schema (Cloudflare D1)
-- Laukai su priesaga _enc saugomi užšifruoti (functions/_lib/crypto.js).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS partners (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  company_code    TEXT,
  notify_emails   TEXT NOT NULL DEFAULT '[]',   -- JSON masyvas
  criteria        TEXT NOT NULL DEFAULT '{}',   -- JSON: kokių klientų neaptarnauja
  pricing         TEXT NOT NULL DEFAULT '{}',   -- JSON: 2 priedo kainodara
  template_key    TEXT,                         -- R2 kelias iki sutarties šablono
  active          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS partner_users (
  id              TEXT PRIMARY KEY,
  partner_id      TEXT NOT NULL REFERENCES partners(id),
  email           TEXT NOT NULL UNIQUE,
  totp_secret_enc TEXT,
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,             -- saugomas tik maišos (hash) pavidalu
  user_id         TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('partner','admin')),
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id              TEXT PRIMARY KEY,             -- atsitiktinis, naudojamas nuorodose
  status          TEXT NOT NULL DEFAULT 'juodrastis' CHECK (status IN (
                    'juodrastis','laukia_kliento_paraso','laukia_apmokejimo','apmoketa',
                    'pasirasyta','grazinta','partneris_atsisake','pasibaige_terminas',
                    'atsaukta','uzdaryta')),
  partner_id      TEXT REFERENCES partners(id),
  client_enc      TEXT,                         -- pavadinimas, kodas, kontaktai (užšifruota)
  answers_enc     TEXT,                         -- klausimyno atsakymai (užšifruota)
  summary         TEXT NOT NULL DEFAULT '{}',   -- tik tai, ką partneris mato iki apmokėjimo
  price_eur       REAL,
  deadline_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_partner ON requests(partner_id, status);

CREATE TABLE IF NOT EXISTS contracts (
  id                 TEXT PRIMARY KEY,
  request_id         TEXT NOT NULL UNIQUE REFERENCES requests(id),
  file_key           TEXT,                      -- R2 kelias iki užšifruoto PDF
  wrapped_key        TEXT,                      -- failo raktas, užšifruotas pagrindiniu raktu
  sha256             TEXT,                      -- originalaus PDF maiša
  signing_provider   TEXT,                      -- 'internal' arba 'dokobit'
  signing_ref        TEXT,
  client_signed_at   TEXT,
  partner_signed_at  TEXT,
  delete_after       TEXT,
  deleted_at         TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id                 TEXT PRIMARY KEY,
  request_id         TEXT NOT NULL REFERENCES requests(id),
  provider           TEXT NOT NULL DEFAULT 'paysera',
  provider_order_id  TEXT NOT NULL UNIQUE,      -- apsauga nuo dvigubo įskaitymo
  provider_payment_id TEXT,
  amount_cents       INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  status             TEXT NOT NULL DEFAULT 'pradeta' CHECK (status IN ('pradeta','apmoketa','nepavyko','grazinta')),
  refund_reason      TEXT,
  paid_at            TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  partner_id      TEXT NOT NULL REFERENCES partners(id),
  month           TEXT NOT NULL,                -- 'YYYY-MM'
  amount_cents    INTEGER NOT NULL,
  file_key        TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (partner_id, month)
);

-- Žurnalas: tik įrašoma, niekada nekeičiama ir netrinama.
CREATE TABLE IF NOT EXISTS audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor_type      TEXT NOT NULL CHECK (actor_type IN ('client','partner','admin','system','provider')),
  actor_id        TEXT,
  action          TEXT NOT NULL,
  object_type     TEXT,
  object_id       TEXT,
  ip              TEXT
);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log yra nekeičiamas'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log yra nekeičiamas'); END;

-- Vienkartinės atsisiuntimo nuorodos (saugoma tik žetono maiša).
CREATE TABLE IF NOT EXISTS download_tokens (
  token_hash      TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES contracts(id),
  expires_at      TEXT NOT NULL,
  used_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
