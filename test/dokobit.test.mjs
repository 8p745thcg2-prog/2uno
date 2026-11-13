// Dokobit kelias (su imituotu Dokobit API): pasirašymo sukūrimas, postback, būsena, saugumas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { b64encode } from '../functions/_lib/crypto.js';
import { splitName } from '../functions/_lib/dokobit.js';
import { onRequestPost as create } from '../functions/api/requests.js';
import { onRequestPost as postback } from '../functions/api/sign/dokobit.js';
import { onRequestGet as status } from '../functions/api/sign/status.js';

assert.deepEqual(splitName('Ona Marija Petraitienė'), { name: 'Ona Marija', surname: 'Petraitienė' });

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({ _sql: sql, _args: [], bind(...a) { return { ...this, _args: a }; },
  async run() { const r = sqlite.prepare(this._sql).run(...this._args); return { meta: { changes: r.changes } }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
  async all() { return { results: sqlite.prepare(this._sql).all(...this._args) }; } });
const DB = { prepare: stmt, async batch(l) { for (const s of l) await s.run(); } };
const store = new Map();
const env = { APP_ENV: 'test', DB, DOKOBIT_ACCESS_TOKEN: 'slaptas', DOKOBIT_URL: 'https://gw.test',
  CONTRACTS: { async put(k, v) { store.set(k, v); }, async get() { return null; } }, MASTER_KEY: b64encode(crypto.getRandomValues(new Uint8Array(32))) };

// Imituotas Dokobit
const calls = [];
let signed = false;
const SIGNED_PDF = new TextEncoder().encode('%PDF-1.7 pasirasyta');
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); calls.push({ path: u.pathname, method: init.method || 'GET', body: init.body, token: u.searchParams.get('access_token') });
  const J = (o) => new Response(JSON.stringify(o));
  if (u.pathname === '/api/file/upload.json') return J({ status: 'ok', token: 'FILE1' });
  if (u.pathname === '/api/file/upload/FILE1/status.json') return J({ status: 'uploaded' });
  if (u.pathname === '/api/signing/create.json') {
    const p = JSON.parse(init.body);
    return J({ status: 'ok', token: 'SIGNTOKEN123', signers: { [p.signers[0].id]: 'SIGNERTOK' } });
  }
  if (u.pathname === '/api/signing/SIGNTOKEN123/status.json') return J(signed ? { status: 'completed', file: 'https://gw.test/files/x.pdf' } : { status: 'pending' });
  if (u.pathname === '/files/x.pdf') return new Response(SIGNED_PDF);
  if (u.hostname === 'evil.test') return new Response('%PDF-blogas');
  return new Response('{}', { status: 404 });
};

const client = { name: 'UAB „Testas“', code: '123456789', address: 'Testo g. 1', representative: 'Jonas Jonaitis', position: 'direktorius', basis: 'įstatus', email: 'j@t.lt' };
const r = await create({ env, request: new Request('https://dev.2uno.pages.dev/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ providerName: 'A', priceEur: 100, summary: { legalForm: 'UAB' }, client, signature: { fullName: '', consent: true } }) }) });
assert.equal(r.status, 201);
const out = await r.json();
assert.equal(out.signUrl, 'https://gw.test/signing/SIGNTOKEN123?access_token=SIGNERTOK');
assert.ok(out.statusToken && !out.downloadUrl);
assert.ok(calls.every((c) => c.token === 'slaptas'));
const createBody = JSON.parse(calls.find((c) => c.path === '/api/signing/create.json').body);
assert.equal(createBody.signers[0].name, 'Jonas'); assert.equal(createBody.signers[0].surname, 'Jonaitis');
assert.deepEqual(createBody.signers[0].signing_options, ['smartid', 'mobile', 'stationary']);
assert.equal(createBody.postback_url, 'https://dev.2uno.pages.dev/api/sign/dokobit');
assert.equal(createBody.files[0].token, 'FILE1');
const upload = JSON.parse(calls.find((c) => c.path === '/api/file/upload.json').body);
assert.match(upload.file.digest, /^[0-9a-f]{64}$/); assert.equal(upload.file.name.endsWith('.pdf'), true);

// Iki parašo partneris nieko negauna, užklausa „laukia kliento parašo“
assert.equal(sqlite.prepare('SELECT status FROM requests').get().status, 'laukia_kliento_paraso');
assert.equal(store.size, 0);
// Partneris nepasirašytos užklausos nemato
{
  const { loadRequest } = await import('../functions/_lib/partner.js');
  const rid = sqlite.prepare('SELECT id FROM requests').get().id;
  assert.equal(await loadRequest(env, rid, 'demo-partner-0001'), null);
}
const st = (t) => status({ env, request: new Request('https://dev.2uno.pages.dev/api/sign/status?t=' + t) });
assert.equal((await (await st(out.statusToken)).json()).signed, false);
assert.equal((await st('x'.repeat(43))).status, 404);

// Netikras postback (nežinomas žetonas) – ignoruojamas
const pb = (body) => postback({ env, request: new Request('https://dev.2uno.pages.dev/api/sign/dokobit', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }) });
assert.equal((await pb('token=NEZINOMAS123&action=signing_completed')).status, 200);
// Tikras žetonas, bet Dokobit sako „pending“ – nieko nekeičiama (postback turiniu nepasitikima)
await pb('token=SIGNTOKEN123&action=signing_completed');
assert.equal(sqlite.prepare('SELECT status FROM requests').get().status, 'laukia_kliento_paraso');

// Pasirašyta
signed = true;
await pb('token=SIGNTOKEN123&action=signing_completed');
const req = sqlite.prepare('SELECT status, deadline_at FROM requests').get();
assert.equal(req.status, 'laukia_apmokejimo'); assert.ok(req.deadline_at);
assert.equal(store.size, 1);
const c = sqlite.prepare('SELECT sha256, client_signed_at, file_key FROM contracts').get();
{
  const { loadRequest } = await import('../functions/_lib/partner.js');
  const rid = sqlite.prepare('SELECT id FROM requests').get().id;
  assert.ok(await loadRequest(env, rid, 'demo-partner-0001'));
}
assert.ok(c.sha256 && c.client_signed_at && c.file_key);
// Pakartotinis postback – nieko nedubliuoja
await pb('token=SIGNTOKEN123&action=signing_completed');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'contract_signed'").get().n, 1);
// Klientas gauna atsisiuntimo nuorodą vieną kartą
const s1 = await (await st(out.statusToken)).json();
assert.equal(s1.signed, true); assert.match(s1.downloadUrl, /^\/api\/demo\/contracts\/.+\/download\?t=/);
assert.equal((await st(out.statusToken)).status, 404);

// Failo adresas ne iš Dokobit – atmetamas
const { downloadSigned } = await import('../functions/_lib/dokobit.js');
await assert.rejects(downloadSigned(env, 'https://evil.test/x.pdf'), /netikėtas/);
console.log('Visi Dokobit testai praėjo');
