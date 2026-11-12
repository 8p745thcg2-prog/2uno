// El. laiškai: siuntimas per Resend (imituojamas fetch), be kliento duomenų, be rakto – nesiunčiama.
import assert from 'node:assert/strict';
import { sendMail, loginCodeMail, newRequestMail, layout } from '../functions/_lib/mail.js';

const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }); };

let r = await sendMail({}, { to: 'a@b.lt', subject: 'x', html: '', text: '' });
assert.deepEqual(r, { ok: false, error: 'not_configured' });
assert.equal(calls.length, 0);

r = await sendMail({ RESEND_API_KEY: 'k' }, { to: 'a@b.lt', ...loginCodeMail('012345') });
assert.equal(r.ok, true);
const body = JSON.parse(calls[0].init.body);
assert.equal(body.from, '2uno.lt <pranesimai@2uno.lt>');
assert.deepEqual(body.to, ['a@b.lt']);
assert.match(body.subject, /012345/);
assert.equal(calls[0].init.headers.Authorization, 'Bearer k');

const m = newRequestMail({ origin: 'https://2uno.lt', requestId: 'abc_DEF-123', summary: { number: '2UNO-1', legalForm: 'UAB', employees: '1–5' }, priceEur: 150, deadlineAt: '2026-11-13T15:00:00Z' });
assert.match(m.html, /https:\/\/2uno\.lt\/partneris\?u=abc_DEF-123/);
assert.match(m.text, /150,00 €/);
assert.match(m.subject, /2UNO-1/);

assert.doesNotMatch(layout({ title: '<script>x</script>' }).html, /<script>/);

globalThis.fetch = async () => new Response('{"message":"bad"}', { status: 422 });
r = await sendMail({ RESEND_API_KEY: 'k' }, { to: 'a@b.lt', subject: 's', html: '', text: '' });
assert.deepEqual(r, { ok: false, error: 'http_422' });
console.log('mail: OK');
