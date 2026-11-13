// Turnstile: be rakto praleidžiama, su raktu – tik patvirtintas žetonas.
import assert from 'node:assert/strict';
import { verifyTurnstile } from '../functions/_lib/turnstile.js';
import { onRequestPost as login } from '../functions/api/partner/login.js';

assert.equal(await verifyTurnstile({}, '', null), true);
const env = { TURNSTILE_SECRET: 's' };
assert.equal(await verifyTurnstile(env, '', null), false);
let sentBody = null;
globalThis.fetch = async (u, i) => { sentBody = i.body; return new Response(JSON.stringify({ success: i.body.get('response') === 'geras' })); };
assert.equal(await verifyTurnstile(env, 'geras', new Request('https://x', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })), true);
assert.equal(sentBody.get('remoteip'), '1.2.3.4');
assert.equal(await verifyTurnstile(env, 'blogas', null), false);
globalThis.fetch = async () => { throw new Error('tinklas'); };
assert.equal(await verifyTurnstile(env, 'geras', null), false);

// Prisijungimas be žetono atmetamas, kai Turnstile įjungtas
const r = await login({ env: { ...env, APP_ENV: 'test' }, request: new Request('https://x/api/partner/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@a.lt' }) }) });
assert.equal(r.status, 403);
console.log('Visi Turnstile testai praėjo');
