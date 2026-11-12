// Termino priminimai: tik su teisingu raktu, tik artėjant terminui, tik vieną kartą.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as remind } from '../functions/api/cron/reminders.js';
import { onRequest as mw } from '../functions/_middleware.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({ _sql: sql, _args: [], bind(...a) { return { ...this, _args: a }; },
  async run() { const r = sqlite.prepare(this._sql).run(...this._args); return { meta: { changes: r.changes } }; },
  async first() { return sqlite.prepare(this._sql).get(...this._args) ?? null; },
  async all() { return { results: sqlite.prepare(this._sql).all(...this._args) }; } });
const DB = { prepare: stmt };
const env = { APP_ENV: 'test', DB, CRON_SECRET: 'slaptas', RESEND_API_KEY: 'k', TEST_ACCESS_PASSWORD: 'pw' };
const sent = [];
globalThis.fetch = async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('{"id":"x"}'); };

sqlite.exec("INSERT INTO partners (id, name, notify_emails, active) VALUES ('p1', 'P', '[\"p@p.lt\"]', 1)");
const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const add = (id, status, h) => sqlite.prepare("INSERT INTO requests (id, status, partner_id, summary, price_eur, deadline_at) VALUES (?, ?, 'p1', ?, 100, ?)").run(id, status, JSON.stringify({ number: '2UNO-' + id }), iso(h));
add('soon00001', 'laukia_apmokejimo', 1.5);
add('later0001', 'laukia_apmokejimo', 5);
add('past00001', 'laukia_apmokejimo', -1);
add('paid00001', 'apmoketa', 1);

const call = (key) => remind({ env, request: new Request('https://dev.2uno.pages.dev/api/cron/reminders', { method: 'POST', headers: key ? { 'X-Cron-Key': key } : {} }) });
assert.equal((await call()).status, 403);
assert.equal((await call('blogas')).status, 403);
assert.equal((await remind({ env: { ...env, CRON_SECRET: '' }, request: new Request('https://x/api/cron/reminders', { method: 'POST', headers: { 'X-Cron-Key': '' } }) })).status, 403);

let r = await (await call('slaptas')).json();
assert.deepEqual([r.checked, r.sent], [1, 1]);
assert.equal(sent.length, 1);
assert.deepEqual(sent[0].to, ['p@p.lt']);
assert.match(sent[0].subject, /2UNO-soon00001/);
assert.match(sent[0].html, /partneris\?u=soon00001/);

r = await (await call('slaptas')).json();
assert.deepEqual([r.checked, r.sent], [0, 0]);
assert.equal(sent.length, 1);

// Middleware: cron kelias praleidžiamas be testinės aplinkos slaptažodžio, kiti – ne.
const next = async () => new Response('ok');
assert.equal((await mw({ env, next, request: new Request('https://dev.2uno.pages.dev/api/cron/reminders', { method: 'POST' }) })).status, 200);
assert.equal((await mw({ env, next, request: new Request('https://dev.2uno.pages.dev/api/cron/reminders') })).status, 401);
assert.equal((await mw({ env, next, request: new Request('https://dev.2uno.pages.dev/cron/worker.js') })).status, 404);
console.log('Visi priminimų testų praėjo'.replace('testų praėjo','testai prėjo').replace('prėjo','praėjo'));
