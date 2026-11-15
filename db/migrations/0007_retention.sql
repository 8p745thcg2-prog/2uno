-- Saugojimo terminai: veiksmų žurnalo įrašus leidžiama trinti tik praėjus 365 d.
DROP TRIGGER IF EXISTS audit_log_no_delete;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete_recent BEFORE DELETE ON audit_log
WHEN OLD.at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-365 days')
BEGIN SELECT RAISE(ABORT, 'audit_log yra nekeičiamas'); END;
