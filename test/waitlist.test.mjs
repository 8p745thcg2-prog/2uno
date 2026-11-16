// Laukiančiųjų sąrašas: registracija, dvigubas patvirtinimas, vienodi atsakymai, valymas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as signup } from '../functions/api/waitlist/index.js';
import { onRequestPost as confirm } from '../functions/api/waitlist/confirm.js';
import { onRequestPost as cron } from '../functions/api/cron/reminders.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({ _sql: sql, _args: [], bind(...a) { return { ...this, _args: a }; },
  async run() { const r = sqlite.prepare(this._sql).run(...this._args); return { meta: { changes: r.changes } }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
  async all() { return { results: sqlite.prepare(this._sql).all(...this._args) }; } });
const DB = { prepare: stmt, async batch(l) { for (const s of l) await s.run(); } };
const env = { APP_ENV: 'production', DB, RESEND_API_KEY: 'k', CRON_SECRET: 'c', CONTRACTS: { async delete() {} } };
const sent = [];
globalThis.fetch = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"x"}'); };

const O = 'https://2uno.lt';
const req = (path, body, headers = {}) => new Request(O + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const J = async (r) => ({ s: r.status, d: await r.json() });

// Validacija
assert.equal((await signup({ env, request: req('/api/waitlist', { email: 'blogas', consent: true }) })).status, 400);
assert.equal((await signup({ env, request: req('/api/waitlist', { email: 'a@b.lt' }) })).status, 400); // be sutikimo
assert.equal((await signup({ env, request: req('/api/waitlist', { email: 'a@b.lt', consent: true }, { Origin: 'https://evil.example' }) })).status, 403);
assert.equal((await signup({ env: { ...env, TURNSTILE_SECRET: 's' }, request: req('/api/waitlist', { email: 'a@b.lt', consent: true }) })).status, 403);

// Registracija: laiškas su nuoroda, duomenų bazėje – tik žetono maiša
let r = await J(await signup({ env, request: req('/api/waitlist', { email: ' Jonas@Imone.LT ', consent: true }) }));
assert.equal(r.s, 200);
assert.equal(sent.length, 1);
assert.deepEqual(sent[0].to, ['jonas@imone.lt']);
const link = sent[0].text.match(/https:\/\/2uno\.lt\/netrukus\?t=([A-Za-z0-9_-]+)/);
assert.ok(link);
const token = link[1];
const row = sqlite.prepare('SELECT * FROM waitlist').get();
assert.equal(row.email, 'jonas@imone.lt'); assert.equal(row.confirmed_at, null);
assert.ok(!JSON.stringify(row).includes(token));

// Pakartotinai per 10 min. – laiškas nesiunčiamas, atsakymas toks pat
const again = await J(await signup({ env, request: req('/api/waitlist', { email: 'jonas@imone.lt', consent: true }) }));
assert.deepEqual(again, r); assert.equal(sent.length, 1);

// Patvirtinimas: blogas žetonas – ne; teisingas – taip; antrą kartą – ne
assert.equal((await confirm({ env, request: req('/api/waitlist/confirm', { t: 'x'.repeat(43) }) })).status, 400);
assert.equal((await confirm({ env, request: req('/api/waitlist/confirm', { t: token }, { Origin: 'https://evil.example' }) })).status, 403);
assert.equal((await confirm({ env, request: req('/api/waitlist/confirm', { t: token }) })).status, 200);
assert.ok(sqlite.prepare('SELECT confirmed_at FROM waitlist').get().confirmed_at);
assert.equal((await confirm({ env, request: req('/api/waitlist/confirm', { t: token }) })).status, 400);

// Jau patvirtintas – vėl registruojantis laiškas nesiunčiamas, atsakymas toks pat
sqlite.prepare("UPDATE waitlist SET last_mail_at = '2000-01-01'").run();
assert.deepEqual(await J(await signup({ env, request: req('/api/waitlist', { email: 'jonas@imone.lt', consent: true }) })), r);
assert.equal(sent.length, 1);

// Pasibaigęs žetonas netinka
await signup({ env, request: req('/api/waitlist', { email: 'ona@imone.lt', consent: true }) });
const t2 = sent[1].text.match(/t=([A-Za-z0-9_-]+)/)[1];
sqlite.prepare("UPDATE waitlist SET token_expires_at = '2000-01-01' WHERE email = 'ona@imone.lt'").run();
assert.equal((await confirm({ env, request: req('/api/waitlist/confirm', { t: t2 }) })).status, 400);

// Valymas: nepatvirtinti po 7 d. ištrinami, patvirtinti lieka
sqlite.prepare("UPDATE waitlist SET created_at = '2000-01-01'").run();
await cron({ env, request: new Request(O + '/api/cron/reminders', { method: 'POST', headers: { 'X-Cron-Key': 'c' } }) });
assert.deepEqual(sqlite.prepare('SELECT email FROM waitlist').all().map((x) => x.email), ['jonas@imone.lt']);
console.log('Visi laukiančiųjų sąrašo testai praėjo');
