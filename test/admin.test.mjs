// Administratoriaus portalas: kodas el. paštu + 2FA, prieiga tik administratoriams, įmonių valdymas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { b64encode, encryptField } from '../functions/_lib/crypto.js';
import { totpAt, checkTotp, base32Encode, base32Decode } from '../functions/_lib/admin-auth.js';
import { onRequestPost as login } from '../functions/api/admin/login.js';
import { onRequestPost as verify } from '../functions/api/admin/verify.js';
import { onRequestPost as setup } from '../functions/api/admin/totp-setup.js';
import { onRequestPost as totp } from '../functions/api/admin/totp-verify.js';
import { onRequestGet as me } from '../functions/api/admin/me.js';
import { onRequestPost as logout } from '../functions/api/admin/logout.js';
import { onRequestGet as listReq } from '../functions/api/admin/requests/index.js';
import { onRequestGet as oneReq } from '../functions/api/admin/requests/[id].js';
import { onRequestGet as listP, onRequestPost as createP } from '../functions/api/admin/partners/index.js';
import { onRequestPost as updateP } from '../functions/api/admin/partners/[id].js';

// RFC 6238 bandomasis vektorius (SHA-1, 59 s → 94287082, paskutiniai 6 skaitmenys)
const rfcKey = base32Encode(new TextEncoder().encode('12345678901234567890'));
assert.equal(await totpAt(rfcKey, 1), '287082');
assert.deepEqual([...base32Decode(rfcKey)], [...new TextEncoder().encode('12345678901234567890')]);

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({ _sql: sql, _args: [], bind(...a) { return { ...this, _args: a }; },
  async run() { const r = sqlite.prepare(this._sql).run(...this._args); return { meta: { changes: r.changes } }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
  async all() { return { results: sqlite.prepare(this._sql).all(...this._args) }; } });
const DB = { prepare: stmt, async batch(l) { sqlite.exec('BEGIN'); try { for (const s of l) await s.run(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
const env = { APP_ENV: 'test', DB, ADMIN_EMAILS: 'boss@2uno.lt', MASTER_KEY: b64encode(crypto.getRandomValues(new Uint8Array(32))) };
const O = 'https://dev.2uno.pages.dev';
const req = (path, { method = 'GET', body, cookie } = {}) => new Request(O + path, {
  method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const J = async (r) => ({ s: r.status, d: await r.json(), r });

// Ne administratorius: kodas nesukuriamas
let r = await J(await login({ env, request: req('/api/admin/login', { method: 'POST', body: { email: 'kitas@x.lt' } }) }));
assert.equal(r.s, 200); assert.equal(r.d.devCode, undefined);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM admin_users').get().n, 0);

// Administratorius: kodas (paštas testuose nesukonfigūruotas → devCode)
r = await J(await login({ env, request: req('/api/admin/login', { method: 'POST', body: { email: 'Boss@2uno.lt' } }) }));
const code = r.d.devCode;
assert.match(code, /^\d{6}$/);
assert.equal((await J(await verify({ env, request: req('/api/admin/verify', { method: 'POST', body: { email: 'boss@2uno.lt', code: '000000' === code ? '111111' : '000000' } }) }))).s, 401);
r = await J(await verify({ env, request: req('/api/admin/verify', { method: 'POST', body: { email: 'boss@2uno.lt', code } }) }));
assert.equal(r.s, 200); assert.equal(r.d.needsSetup, true);
const cookie = r.r.headers.get('Set-Cookie').split(';')[0];
assert.match(r.r.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Strict/);
// Kodas vienkartinis
assert.equal((await verify({ env, request: req('/api/admin/verify', { method: 'POST', body: { email: 'boss@2uno.lt', code } }) })).status, 401);

// Be antro žingsnio – jokių duomenų
assert.equal((await listReq({ env, request: req('/api/admin/requests', { cookie }) })).status, 401);
r = await J(await me({ env, request: req('/api/admin/me', { cookie }) }));
assert.deepEqual([r.d.mfaOk, r.d.hasTotp], [false, false]);

// 2FA nustatymas
r = await J(await setup({ env, request: req('/api/admin/totp-setup', { method: 'POST', cookie }) }));
assert.match(r.d.uri, /^otpauth:\/\/totp\/2uno\.lt%3Aboss%402uno\.lt\?secret=[A-Z2-7]+&issuer=2uno\.lt/);
const secret = r.d.secret;
assert.equal(sqlite.prepare('SELECT totp_pending_enc LIKE ? AS x FROM admin_users').get('v1.%').x, 1); // užšifruota
const step = Math.floor(Date.now() / 30000);
assert.equal((await totp({ env, request: req('/api/admin/totp-verify', { method: 'POST', cookie, body: { code: '123456' === await totpAt(secret, step) ? '654321' : '123456' } }) })).status, 401);
const good = await totpAt(secret, step);
assert.equal((await totp({ env, request: req('/api/admin/totp-verify', { method: 'POST', cookie, body: { code: good } }) })).status, 200);
r = await J(await me({ env, request: req('/api/admin/me', { cookie }) }));
assert.deepEqual([r.d.mfaOk, r.d.hasTotp], [true, true]);
// Antrą kartą nustatyti nebegalima; tas pats kodas pakartotinai nepriimamas
assert.equal((await setup({ env, request: req('/api/admin/totp-setup', { method: 'POST', cookie }) })).status, 409);
assert.equal(await checkTotp(secret, good, step), null);

// Įmonės: sukūrimas, sąrašas, keitimas
r = await J(await createP({ env, request: req('/api/admin/partners', { method: 'POST', cookie, body: { name: '', companyCode: '12' } }) }));
assert.equal(r.s, 422); assert.ok(r.d.fields.name && r.d.fields.companyCode);
r = await J(await createP({ env, request: req('/api/admin/partners', { method: 'POST', cookie, body: { name: 'UAB „Apskaita“', companyCode: '123456789', notifyEmails: 'a@a.lt, b@a.lt', userEmails: ['A@a.lt'], active: true } }) }));
assert.equal(r.s, 201);
const pid = r.d.id;
r = await J(await listP({ env, request: req('/api/admin/partners', { cookie }) }));
const p = r.d.partners.find((x) => x.id === pid);
assert.deepEqual([p.name, p.active, p.notifyEmails, p.users.map((u) => u.email)], ['UAB „Apskaita“', true, ['a@a.lt', 'b@a.lt'], ['a@a.lt']]);
r = await J(await updateP({ env, params: { id: pid }, request: req('/api/admin/partners/' + pid, { method: 'POST', cookie, body: { name: 'UAB „Apskaita“', notifyEmails: 'a@a.lt', userEmails: 'c@a.lt', active: false } }) }));
assert.equal(r.s, 200);
assert.deepEqual(sqlite.prepare('SELECT email FROM partner_users WHERE partner_id = ?').all(pid).map((x) => x.email), ['c@a.lt']);
assert.equal(sqlite.prepare('SELECT active FROM partners WHERE id = ?').get(pid).active, 0);
// Svetimas šaltinis (CSRF) atmetamas
const evil = new Request(O + '/api/admin/partners', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: cookie }, body: '{}' });
assert.equal((await createP({ env, request: evil })).status, 403);

// Užklausos: sąraše be kliento duomenų, detalėje – su jais (ir įrašu žurnale)
sqlite.prepare("INSERT INTO requests (id, status, partner_id, summary, price_eur, deadline_at) VALUES ('req0000001', 'laukia_apmokejimo', ?, ?, 99, '2030-01-01T00:00:00Z')").run(pid, JSON.stringify({ number: '2UNO-X' }));
sqlite.prepare("UPDATE requests SET client_enc = ? WHERE id = 'req0000001'").run(await encryptField(env, JSON.stringify({ name: 'UAB „Klientas“', email: 'k@k.lt' }), 'request:req0000001'));
r = await J(await listReq({ env, request: req('/api/admin/requests?status=laukia_apmokejimo', { cookie }) }));
assert.equal(r.d.requests.length, 1);
assert.doesNotMatch(JSON.stringify(r.d), /k@k\.lt/);
r = await J(await oneReq({ env, params: { id: 'req0000001' }, request: req('/api/admin/requests/req0000001', { cookie }) }));
assert.equal(r.d.client.email, 'k@k.lt');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'admin_view_client'").get().n, 1);

// Partnerio sesija administratoriaus API neatidaro
sqlite.prepare("INSERT INTO sessions (id, user_id, role, expires_at) VALUES ('x', 'y', 'partner', '2030-01-01')").run();
// Atsijungus – nebegalioja
await logout({ env, request: req('/api/admin/logout', { method: 'POST', cookie }) });
assert.equal((await listReq({ env, request: req('/api/admin/requests', { cookie }) })).status, 401);

// Ne administratoriaus sąraše esantis adresas (pvz. pašalintas iš ADMIN_EMAILS) – prieigos nebėra
const env2 = { ...env, ADMIN_EMAILS: 'kitas@2uno.lt' };
r = await J(await login({ env: env2, request: req('/api/admin/login', { method: 'POST', body: { email: 'boss@2uno.lt' } }) }));
assert.equal(r.d.devCode, undefined);
console.log('Visi administratoriaus testai praėjo');

// Paros riba: po 15 nesėkmingų bandymų per 24 val. – užrakinta parai (net ir su teisingu kodu)
{
  const { verifyLoginCode, createLoginCode } = await import('../functions/_lib/auth.js');
  sqlite.prepare("INSERT INTO partners (id, name, active) VALUES ('pp', 'P', 1)").run();
  sqlite.prepare("INSERT INTO partner_users (id, partner_id, email) VALUES ('uu', 'pp', 'u@u.lt')").run();
  for (let i = 0; i < 15; i++) sqlite.prepare("INSERT INTO audit_log (actor_type, actor_id, action) VALUES ('partner', 'uu', 'login_fail')").run();
  assert.equal((await createLoginCode(env, 'u@u.lt')).ok, false);
  assert.match((await verifyLoginCode(env, 'u@u.lt', '123456')).error, /24 val/);
}
// Saugus numatytasis režimas: be APP_ENV laikoma produkcija
{
  const { isProduction, sameOrigin } = await import('../functions/_lib/http.js');
  assert.equal(isProduction({}), true);
  assert.equal(isProduction({ APP_ENV: 'test' }), false);
  assert.equal(sameOrigin(new Request('https://a.lt/x', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })), false);
  assert.equal(sameOrigin(new Request('https://a.lt/x', { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://a.lt' } })), true);
}
console.log('Papildomi saugumo testai praėjo');

// Administratoriė atrakina užrakintą įmonės darbuotoją
{
  const { onRequestPost: unlock } = await import('../functions/api/admin/partners/[id]/unlock.js');
  const { createLoginCode } = await import('../functions/_lib/auth.js');
  const { sha256Hex } = await import('../functions/_lib/crypto.js');
  // patvirtinta administratoriaus sesija tiesiai duomenų bazėje
  const tok = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  const adminId = sqlite.prepare("SELECT id FROM admin_users WHERE email = 'boss@2uno.lt'").get().id;
  sqlite.prepare("INSERT INTO sessions (id, user_id, role, expires_at, mfa_ok) VALUES (?, ?, 'admin', '2030-01-01', 1)").run(await sha256Hex(new TextEncoder().encode(tok)), adminId);
  const c2 = '__Host-2uno_a=' + tok;
  let lp = await (await listP({ env, request: req('/api/admin/partners', { cookie: c2 }) })).json();
  assert.equal(lp.partners.find((x) => x.id === 'pp').users[0].locked, true);
  assert.equal((await unlock({ env, params: { id: 'pp' }, request: req('/api/admin/partners/pp/unlock', { method: 'POST', cookie: c2, body: { email: 'u@u.lt' } }) })).status, 200);
  lp = await (await listP({ env, request: req('/api/admin/partners', { cookie: c2 }) })).json();
  assert.equal(lp.partners.find((x) => x.id === 'pp').users[0].locked, false);
  assert.equal((await createLoginCode(env, 'u@u.lt')).ok, true);
  // svetimos įmonės darbuotojo per kitą įmonę atrakinti negalima
  assert.equal((await unlock({ env, params: { id: pid }, request: req('/x', { method: 'POST', cookie: c2, body: { email: 'u@u.lt' } }) })).status, 404);
  // be administratoriaus sesijos – ne
  assert.equal((await unlock({ env, params: { id: 'pp' }, request: req('/x', { method: 'POST', body: { email: 'u@u.lt' } }) })).status, 401);
}
console.log('Atrakinimo testai praėjo');
