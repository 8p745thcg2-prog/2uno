// Partnerio kelias: demo užklausa → prisijungimas kodu → užrakinta → testinis apmokėjimas → atrakinta → atsisiuntimas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { b64encode } from '../functions/_lib/crypto.js';
import { onRequestPost as seed } from '../functions/api/demo/seed.js';
import { onRequestPost as login } from '../functions/api/partner/login.js';
import { onRequestPost as verify } from '../functions/api/partner/verify.js';
import { onRequestGet as me } from '../functions/api/partner/me.js';
import { onRequestGet as list } from '../functions/api/partner/requests/index.js';
import { onRequestGet as detail } from '../functions/api/partner/requests/[id]/index.js';
import { onRequestPost as payTest } from '../functions/api/partner/requests/[id]/pay-test.js';
import { onRequestPost as decline } from '../functions/api/partner/requests/[id]/decline.js';
import { onRequestPost as dlLink } from '../functions/api/partner/requests/[id]/download-link.js';
import { onRequestGet as download } from '../functions/api/partner/contracts/[id]/download.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({
  _sql: sql, _args: [],
  bind(...a) { return { ...this, _args: a }; },
  async run() { const r = sqlite.prepare(this._sql).run(...this._args); return { success: true, meta: { changes: r.changes } }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
  async all() { return { results: sqlite.prepare(this._sql).all(...this._args) }; },
});
const DB = { prepare: stmt, async batch(l) { sqlite.exec('BEGIN'); try { for (const s of l) await s.run(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
const store = new Map();
const CONTRACTS = { async put(k, v) { store.set(k, new Uint8Array(v)); }, async get(k) { const v = store.get(k); return v ? { arrayBuffer: async () => v.slice().buffer } : null; } };
const env = { APP_ENV: 'test', DB, CONTRACTS, MASTER_KEY: b64encode(crypto.getRandomValues(new Uint8Array(32))) };
const O = 'https://dev.2uno.pages.dev';
const req = (path, { method = 'GET', body, cookie } = {}) => new Request(O + path, {
  method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const J = async (r) => ({ s: r.status, d: await r.json() });

// Demo duomenys dviem partneriams neprieinami: kitas el. paštas priskiriamas tam pačiam demo partneriui
let r = await J(await seed({ env, request: req('/api/demo/seed', { method: 'POST', body: { email: 'Test@Partneris.lt' } }) }));
assert.equal(r.s, 201);
const reqId = r.d.requestId;

// Nežinomas el. paštas – toks pat atsakymas, be kodo
r = await J(await login({ env, request: req('/api/partner/login', { method: 'POST', body: { email: 'nera@x.lt' } }) }));
assert.equal(r.s, 200); assert.equal(r.d.devCode, undefined);

// Kodas ir prisijungimas
r = await J(await login({ env, request: req('/api/partner/login', { method: 'POST', body: { email: 'test@partneris.lt' } }) }));
const code = r.d.devCode; assert.match(code, /^\d{6}$/);
assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM login_codes').all()).includes(code));
r = await J(await login({ env, request: req('/api/partner/login', { method: 'POST', body: { email: 'test@partneris.lt' } }) }));
assert.equal(r.d.devCode, undefined); // per dažnai
let v = await verify({ env, request: req('/api/partner/verify', { method: 'POST', body: { email: 'test@partneris.lt', code: code === '000000' ? '111111' : '000000' } }) });
assert.equal(v.status, 401);
v = await verify({ env, request: req('/api/partner/verify', { method: 'POST', body: { email: 'test@partneris.lt', code } }) });
assert.equal(v.status, 200);
const setCookie = v.headers.get('Set-Cookie');
assert.match(setCookie, /HttpOnly; Secure; SameSite=Strict/);
const cookie = setCookie.split(';')[0];
// Tas pats kodas antrą kartą neveikia
assert.equal((await verify({ env, request: req('/api/partner/verify', { method: 'POST', body: { email: 'test@partneris.lt', code } }) })).status, 401);

assert.equal((await me({ env, request: req('/api/partner/me') })).status, 401);
r = await J(await me({ env, request: req('/api/partner/me', { cookie }) }));
assert.equal(r.d.email, 'test@partneris.lt');

// Sąrašas ir užrakinta užklausa: jokių kliento duomenų
r = await J(await list({ env, request: req('/api/partner/requests', { cookie }) }));
assert.equal(r.d.requests.length, 1);
r = await J(await detail({ env, params: { id: reqId }, request: req('/api/partner/requests/' + reqId, { cookie }) }));
assert.equal(r.d.unlocked, false); assert.equal(r.d.client, undefined);
assert.ok(!JSON.stringify(r.d).includes('Bandomasis'));
assert.equal((await dlLink({ env, params: { id: reqId }, request: req('/x', { method: 'POST', cookie }) })).status, 403);

// Svetimas partneris nemato ir negali apmokėti
sqlite.prepare("INSERT INTO partners (id, name) VALUES ('kitas', 'Kitas')").run();
sqlite.prepare("INSERT INTO partner_users (id, partner_id, email) VALUES ('u2', 'kitas', 'kitas@x.lt')").run();
const c2 = (await J(await login({ env, request: req('/api/partner/login', { method: 'POST', body: { email: 'kitas@x.lt' } }) }))).d.devCode;
const cookie2 = (await verify({ env, request: req('/v', { method: 'POST', body: { email: 'kitas@x.lt', code: c2 } }) })).headers.get('Set-Cookie').split(';')[0];
assert.equal((await detail({ env, params: { id: reqId }, request: req('/x', { cookie: cookie2 }) })).status, 404);
assert.equal((await payTest({ env, params: { id: reqId }, request: req('/x', { method: 'POST', cookie: cookie2 }) })).status, 404);

// CSRF: kito šaltinio POST atmetamas
assert.equal((await payTest({ env, params: { id: reqId }, request: new Request(O + '/x', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example' } }) })).status, 403);

// Apmokėjimas → atrakinta
r = await J(await payTest({ env, params: { id: reqId }, request: req('/x', { method: 'POST', cookie }) }));
assert.equal(r.s, 200); assert.equal(r.d.unlocked, true); assert.equal(r.d.client.name, 'UAB „Bandomoji prekyba“');
assert.equal((await payTest({ env, params: { id: reqId }, request: req('/x', { method: 'POST', cookie }) })).status, 409);

// Atsisiuntimas: reikia ir sesijos, ir žetono; vienkartinis
r = await J(await dlLink({ env, params: { id: reqId }, request: req('/x', { method: 'POST', cookie }) }));
const u = new URL(r.d.url, O); const cid = u.pathname.split('/')[4];
assert.equal((await download({ env, params: { id: cid }, request: new Request(u) })).status, 401);
assert.equal((await download({ env, params: { id: cid }, request: new Request(u, { headers: { Cookie: cookie2 } }) })).status, 404);
let d = await download({ env, params: { id: cid }, request: new Request(u, { headers: { Cookie: cookie } }) });
assert.equal(d.status, 200); assert.equal(Buffer.from(new Uint8Array(await d.arrayBuffer()).slice(0, 5)).toString(), '%PDF-');
assert.equal((await download({ env, params: { id: cid }, request: new Request(u, { headers: { Cookie: cookie } }) })).status, 410);

// Atsisakymas galimas tik iki apmokėjimo
const r2 = await J(await seed({ env, request: req('/s', { method: 'POST', body: { email: 'test@partneris.lt' } }) }));
assert.equal((await decline({ env, params: { id: r2.d.requestId }, request: req('/x', { method: 'POST', cookie }) })).status, 200);
assert.equal((await payTest({ env, params: { id: r2.d.requestId }, request: req('/x', { method: 'POST', cookie }) })).status, 409);

// Blokavimas po 5 klaidingų bandymų
sqlite.prepare("DELETE FROM login_codes").run();
const c3 = (await J(await login({ env, request: req('/l', { method: 'POST', body: { email: 'kitas@x.lt' } }) }))).d.devCode;
for (let i = 0; i < 5; i++) await verify({ env, request: req('/v', { method: 'POST', body: { email: 'kitas@x.lt', code: c3 === '999999' ? '999998' : '999999' } }) });
r = await J(await verify({ env, request: req('/v', { method: 'POST', body: { email: 'kitas@x.lt', code: c3 } }) }));
assert.equal(r.s, 401); assert.match(r.d.error, /15 min/);

// Produkcijoje testinių įrankių nėra, kodas nerodomas
assert.equal((await seed({ env: { ...env, APP_ENV: 'production' }, request: req('/s', { method: 'POST', body: {} }) })).status, 404);
assert.equal((await payTest({ env: { ...env, APP_ENV: 'production' }, params: { id: reqId }, request: req('/x', { method: 'POST', cookie }) })).status, 404);
console.log('Visi partnerio kelio testai praėjo');
