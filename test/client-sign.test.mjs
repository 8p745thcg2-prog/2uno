// Kliento pasirašymas → užklausa partnerio paskyroje (užrakinta).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { b64encode } from '../functions/_lib/crypto.js';
import { onRequestPost as create } from '../functions/api/requests.js';
import { onRequestPost as seed } from '../functions/api/demo/seed.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({ _sql: sql, _args: [], bind(...a) { return { ...this, _args: a }; },
  async run() { const r = sqlite.prepare(this._sql).run(...this._args); return { meta: { changes: r.changes } }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
  async all() { return { results: sqlite.prepare(this._sql).all(...this._args) }; } });
const DB = { prepare: stmt, async batch(l) { for (const s of l) await s.run(); } };
const store = new Map();
const env = { APP_ENV: 'test', DB, CONTRACTS: { async put(k, v) { store.set(k, v); }, async get() { return null; } }, MASTER_KEY: b64encode(crypto.getRandomValues(new Uint8Array(32))) };
const post = (body, env2 = env) => create({ env: env2, request: new Request('https://dev.2uno.pages.dev/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
const client = { name: 'UAB „Testas“', code: '123456789', address: 'Testo g. 1', representative: 'Jonas Jonaitis', position: 'direktorius', basis: 'įstatus', email: 'j@t.lt' };
const base = { providerName: 'Pavyzdinė įmonė A', priceEur: 123.45, summary: { legalForm: 'UAB', employees: '2', invoices: '30 per mėn.', situation: 'Keičiu buhalterį' }, client };

let r = await post({ ...base, signature: { fullName: 'Kitas Žmogus', consent: true } });
assert.equal(r.status, 422); assert.ok((await r.json()).fields.fullName);
r = await post({ ...base, signature: { fullName: 'Jonas Jonaitis', consent: false } });
assert.equal(r.status, 422);
r = await post({ ...base, signature: { fullName: 'jonas jonaitis', consent: true } });
assert.equal(r.status, 201);
const out = await r.json();
assert.match(out.number, /^2UNO-\d{8}-/);
const row = sqlite.prepare('SELECT status, partner_id, price_eur, summary, client_enc, deadline_at FROM requests').get();
assert.equal(row.status, 'laukia_apmokejimo'); assert.equal(row.partner_id, 'demo-partner-0001'); assert.equal(row.price_eur, 123.45);
assert.ok(!row.client_enc.includes('Jonaitis')); assert.equal(JSON.parse(row.summary).situation, 'Keičiu buhalterį');
assert.ok(row.deadline_at > new Date().toISOString());
const c = sqlite.prepare('SELECT signing_ref, client_signed_at FROM contracts').get();
assert.ok(c.client_signed_at && c.signing_ref.startsWith('v1.') && !c.signing_ref.includes('Jonas'));
assert.equal(store.size, 1);
// seed vėliau prideda vartotoją tam pačiam demo partneriui
assert.equal((await seed({ env, request: new Request('https://dev.2uno.pages.dev/s', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"demo@2uno.lt"}' }) })).status, 201);
assert.equal((await post({ ...base, priceEur: -1, signature: { fullName: 'Jonas Jonaitis', consent: true } })).status, 400);
assert.equal((await post({ ...base, signature: { fullName: 'Jonas Jonaitis', consent: true } }, { ...env, APP_ENV: 'production' })).status, 404);
console.log('Visi kliento pasirašymo testai praėjo');
