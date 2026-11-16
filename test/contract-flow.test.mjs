// Visas demo sutarties kelias su netikra D1 (node:sqlite) ir R2 (atmintyje).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { b64encode } from '../functions/_lib/crypto.js';
import { onRequestPost } from '../functions/api/demo/contracts.js';
import { onRequestGet as download } from '../functions/api/demo/contracts/[id]/download.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({
  _sql: sql, _args: [],
  bind(...a) { return { ...this, _args: a }; },
  async run() { sqlite.prepare(this._sql).run(...this._args); return { success: true }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
});
const DB = { prepare: stmt, async batch(list) { sqlite.exec('BEGIN'); try { for (const s of list) await s.run(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
const store = new Map();
const CONTRACTS = {
  async put(k, v) { store.set(k, new Uint8Array(v)); },
  async get(k) { const v = store.get(k); return v ? { arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) } : null; },
};
const env = { APP_ENV: 'test', DB, CONTRACTS, MASTER_KEY: b64encode(crypto.getRandomValues(new Uint8Array(32))) };

const client = { name: 'UAB „Testas“', code: '123456789', vat: '', address: 'Testo g. 1, Vilnius', representative: 'Jonas Jonaitis', position: 'direktorius', basis: 'įstatus', email: 'jonas@testas.lt', phone: '', bank: '' };
const post = (body, headers = {}) => onRequestPost({ env, request: new Request('https://dev.2uno.pages.dev/api/demo/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) });

// Validacija
let r = await post({ ...client, code: '12', email: 'blogas' });
assert.equal(r.status, 422);
const bad = await r.json();
assert.ok(bad.fields.code && bad.fields.email);
assert.equal((await post(client, { Origin: 'https://evil.example' })).status, 403);

// Sugeneravimas
r = await post(client);
assert.equal(r.status, 201);
const out = await r.json();
assert.match(out.number, /^2UNO-DEMO-\d{8}-/);

// Duomenų bazėje kliento duomenys – tik užšifruoti, saugykloje – ne PDF
const row = sqlite.prepare('SELECT client_enc FROM requests').get();
assert.ok(row.client_enc.startsWith('v1.') && !row.client_enc.includes('Jonaitis'));
const blob = [...store.values()][0];
assert.notEqual(Buffer.from(blob.slice(0, 5)).toString(), '%PDF-');
assert.equal(sqlite.prepare('SELECT count(*) n FROM download_tokens').get().n, 1);
assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM download_tokens').all()).includes(out.downloadUrl.split('t=')[1]));

// Atsisiuntimas: pirmą kartą veikia, antrą – ne
const get = (url) => {
  const u = new URL(url, 'https://dev.2uno.pages.dev');
  const id = u.pathname.split('/')[4];
  return download({ env, params: { id }, request: new Request(u) });
};
r = await get(out.downloadUrl);
assert.equal(r.status, 200);
assert.equal(r.headers.get('Content-Type'), 'application/pdf');
const pdf = new Uint8Array(await r.arrayBuffer());
assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
fs.writeFileSync('/tmp/claude-0/flow.pdf', pdf);
assert.equal((await get(out.downloadUrl)).status, 410);
assert.equal((await get(out.downloadUrl.replace(/t=.*/, 't=' + 'x'.repeat(43)))).status, 410);
assert.equal((await get(`/api/demo/contracts/${'A'.repeat(24)}/download?t=${out.downloadUrl.split('t=')[1]}`)).status, 410);

// Pakeistas failas saugykloje aptinkamas
store.set([...store.keys()][0], blob.map((b, i) => (i === 30 ? b ^ 1 : b)));
sqlite.prepare("INSERT INTO download_tokens (token_hash, contract_id, expires_at) SELECT 'h', id, '2999-01-01' FROM contracts").run();
// (žetono maiša 'h' neatitiks jokio žetono – tikriname tik, kad sugadinto failo neįmanoma iššifruoti)
await assert.rejects((await import('../functions/_lib/crypto.js')).decryptBytes(env, { wrappedKey: sqlite.prepare('SELECT wrapped_key w FROM contracts').get().w, ciphertext: store.get([...store.keys()][0]) }, `contract:${out.contractId}`));

// Produkcijoje demo neveikia
assert.equal((await onRequestPost({ env: { ...env, APP_ENV: 'production' }, request: new Request('https://x/api/demo/contracts', { method: 'POST' }) })).status, 404);

// Žurnalas
const log = sqlite.prepare('SELECT action FROM audit_log ORDER BY id').all().map((x) => x.action);
assert.deepEqual(log, ['contract_generated', 'contract_downloaded']);
console.log('Visi sutarties kelio testai praėjo');
