// Saugojimo terminai: kliento duomenys ištrinami laiku, santrauka lieka, senas žurnalas trinamas, naujas – ne.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as cron } from '../functions/api/cron/reminders.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({ _sql: sql, _args: [], bind(...a) { return { ...this, _args: a }; },
  async run() { const r = sqlite.prepare(this._sql).run(...this._args); return { meta: { changes: r.changes } }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
  async all() { return { results: sqlite.prepare(this._sql).all(...this._args) }; } });
const DB = { prepare: stmt, async batch(l) { for (const s of l) await s.run(); } };
const env = { APP_ENV: 'test', DB, CRON_SECRET: 'k', CONTRACTS: { async delete() {} } };
globalThis.fetch = async () => new Response('{}');

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const add = (id, status, updatedDaysAgo) => {
  sqlite.prepare("INSERT INTO requests (id, status, client_enc, answers_enc, summary, updated_at) VALUES (?, ?, 'v1.x', 'v1.y', '{\"number\":\"N\"}', ?)").run(id, status, ago(updatedDaysAgo));
  sqlite.prepare("INSERT INTO contracts (id, request_id, file_key, delete_after) VALUES (?, ?, 'f', ?)").run('c_' + id, id, ago(-60));
};
add('atsaukta_sena', 'atsaukta', 8);
add('atsaukta_nauja', 'atsaukta', 6);
add('pasibaige_sena', 'pasibaige_terminas', 31);
add('pasibaige_nauja', 'pasibaige_terminas', 29);
add('apmoketa_sena', 'apmoketa', 1);       // atnaujinta neseniai, bet apmokėta prieš 400 d.
sqlite.prepare("INSERT INTO payments (id, request_id, provider_order_id, amount_cents, status, paid_at) VALUES ('p1', 'apmoketa_sena', 'o1', 100, 'apmoketa', ?)").run(ago(400));
add('apmoketa_nauja', 'apmoketa', 300);
add('laukia', 'laukia_apmokejimo', 900);   // dar vykstanti – neliečiama

sqlite.prepare("INSERT INTO audit_log (at, actor_type, action) VALUES (?, 'system', 'senas'), (?, 'system', 'naujas')").run(ago(400), ago(300));

const r = await cron({ env, request: new Request('https://x/api/cron/reminders', { method: 'POST', headers: { 'X-Cron-Key': 'k' } }) });
assert.equal(r.status, 200);

const left = Object.fromEntries(sqlite.prepare('SELECT id, client_enc, answers_enc, summary FROM requests').all().map((x) => [x.id, x]));
const erased = (id) => left[id].client_enc === null && left[id].answers_enc === null;
assert.ok(erased('atsaukta_sena') && erased('pasibaige_sena') && erased('apmoketa_sena'));
assert.ok(!erased('atsaukta_nauja') && !erased('pasibaige_nauja') && !erased('apmoketa_nauja') && !erased('laukia'));
assert.equal(left.apmoketa_sena.summary, '{"number":"N"}'); // santrauka lieka
// Ištrintų užklausų sutarties failas – ištrinamas iškart (šiuo arba kitu paleidimu)
const del = (id) => sqlite.prepare('SELECT delete_after, deleted_at FROM contracts WHERE request_id = ?').get(id);
assert.ok(new Date(del('pasibaige_sena').delete_after) <= new Date());
assert.ok(new Date(del('pasibaige_nauja').delete_after) > new Date());
await cron({ env, request: new Request('https://x/api/cron/reminders', { method: 'POST', headers: { 'X-Cron-Key': 'k' } }) });
assert.ok(del('pasibaige_sena').deleted_at);

// Žurnalas: senas ištrintas, naujas lieka; naujo ištrinti neleidžiama
const actions = sqlite.prepare('SELECT action FROM audit_log').all().map((x) => x.action);
assert.ok(!actions.includes('senas') && actions.includes('naujas'));
assert.equal(actions.filter((a) => a === 'client_data_erased_retention').length, 3);
assert.throws(() => sqlite.prepare("DELETE FROM audit_log WHERE action = 'naujas'").run(), /nekeičiamas/);
assert.throws(() => sqlite.prepare("UPDATE audit_log SET action = 'x'").run(), /nekeičiamas/);
console.log('Visi saugojimo terminų testai praėjo');
