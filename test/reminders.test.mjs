// Termino priminimai: tik su teisingu raktu, tik artėjant terminui, tik vieną kartą.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as remind } from '../functions/api/cron/reminders.js';
import { onRequest as mw } from '../functions/_middleware.js';
import { b64encode, encryptField } from '../functions/_lib/crypto.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({ _sql: sql, _args: [], bind(...a) { return { ...this, _args: a }; },
  async run() { const r = sqlite.prepare(this._sql).run(...this._args); return { meta: { changes: r.changes } }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
  async all() { return { results: sqlite.prepare(this._sql).all(...this._args) }; } });
const DB = { prepare: stmt };
const env = { APP_ENV: 'test', DB, CRON_SECRET: 'slaptas', RESEND_API_KEY: 'k', TEST_ACCESS_PASSWORD: 'pw', ADMIN_EMAIL: 'admin@2uno.lt', MASTER_KEY: b64encode(crypto.getRandomValues(new Uint8Array(32))) };
const sent = [];
globalThis.fetch = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"x"}'); };

sqlite.exec("INSERT INTO partners (id, name, notify_emails, active) VALUES ('p1', 'P', '[\"p@p.lt\"]', 1)");
const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const add = (id, status, h) => sqlite.prepare("INSERT INTO requests (id, status, partner_id, summary, price_eur, deadline_at) VALUES (?, ?, 'p1', ?, 100, ?)").run(id, status, JSON.stringify({ number: '2UNO-' + id }), iso(h));
add('soon00001', 'laukia_apmokejimo', 1.5);
add('later0001', 'laukia_apmokejimo', 5);
add('past00001', 'laukia_apmokejimo', -1);
sqlite.prepare('UPDATE requests SET client_enc = ? WHERE id = ?').run(await encryptField(env, JSON.stringify({ name: 'UAB „Klientas“', email: 'k@k.lt', phone: '+370600' }), 'request:past00001'), 'past00001');
add('paid00001', 'apmoketa', 1);

const call = (key) => remind({ env, request: new Request('https://dev.2uno.pages.dev/api/cron/reminders', { method: 'POST', headers: key ? { 'X-Cron-Key': key } : {} }) });
assert.equal((await call()).status, 403);
assert.equal((await call('blogas')).status, 403);
assert.equal((await remind({ env: { ...env, CRON_SECRET: '' }, request: new Request('https://x/api/cron/reminders', { method: 'POST', headers: { 'X-Cron-Key': '' } }) })).status, 403);

let r = await (await call('slaptas')).json();
assert.deepEqual([r.expired, r.checked, r.sent], [1, 1, 1]);
// Pasibaigęs terminas: būsena pakeista, laiškai klientui, įmonei ir administratorei
assert.equal(sqlite.prepare("SELECT status FROM requests WHERE id='past00001'").get().status, 'pasibaige_terminas');
// Testinėje aplinkoje laiškas klientui nukreipiamas administratorei
assert.equal(sent.filter((m) => m.to.includes('k@k.lt')).length, 0);
const toClient = sent.find((m) => /TESTAS – laiškas klientui/.test(m.subject));
assert.deepEqual(toClient.to, ['admin@2uno.lt']);
assert.match(toClient.text, /P per nustatytą terminą/);
assert.doesNotMatch(toClient.text, /\+370600/);
const toAdmin = sent.find((m) => /Praleistas terminas/.test(m.subject));
assert.doesNotMatch(toAdmin.text + toAdmin.subject, /\+370600|k@k\.lt|Klientas“/);
assert.match(toAdmin.text, /per 30 dienų: 1/);
const toPartner = sent.filter((m) => m.to.includes('p@p.lt'));
assert.equal(toPartner.length, 2);
assert.ok(toPartner.some((m) => /nebegalioja/.test(m.subject)));
assert.doesNotMatch(toPartner.map((m) => m.text).join(), /k@k\.lt|Klientas“/);
// Priminimas – tik artėjančiai užklausai
const rem = toPartner.find((m) => /Primename/.test(m.subject));
assert.match(rem.subject, /2UNO-soon00001/);
assert.match(rem.html, /partneris\?u=soon00001/);
assert.equal(sent.length, 4);

r = await (await call('slaptas')).json();
assert.deepEqual([r.expired, r.checked, r.sent], [0, 0, 0]);
assert.equal(sent.length, 4);

// Middleware: cron kelias praleidžiamas be testinės aplinkos slaptažodžio, kiti – ne.
const next = async () => new Response('ok');
assert.equal((await mw({ env, next, request: new Request('https://dev.2uno.pages.dev/api/cron/reminders', { method: 'POST' }) })).status, 200);
assert.equal((await mw({ env, next, request: new Request('https://dev.2uno.pages.dev/api/cron/reminders') })).status, 401);
assert.equal((await mw({ env, next, request: new Request('https://dev.2uno.pages.dev/cron/worker.js') })).status, 404);
console.log('Visi priminimų testai praėjo');
