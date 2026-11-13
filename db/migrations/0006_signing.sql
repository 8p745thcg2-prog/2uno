-- Kvalifikuotas parašas per Dokobit: pasirašymo paieška ir kliento būsenos žetonas
ALTER TABLE contracts ADD COLUMN signing_lookup TEXT;
ALTER TABLE contracts ADD COLUMN client_status_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_contracts_signing_lookup ON contracts(signing_lookup);
CREATE INDEX IF NOT EXISTS idx_contracts_client_status ON contracts(client_status_hash);
