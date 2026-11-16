import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';
const next = async () => new Response('puslapis', { headers: { 'Content-Type': 'text/html' } });
const run = (url, env, headers = {}) => onRequest({ request: new Request(url, { headers }), env, next });
const basic = (p) => ({ Authorization: 'Basic ' + btoa('x:' + p) });

assert.equal((await run('https://t/', {})).status, 503);
assert.equal((await run('https://t/', { TEST_ACCESS_PASSWORD: 'slapt' })).status, 503); // be APP_ENV – uždaryta
assert.equal((await run('https://t/', { APP_ENV: 'test' })).status, 503);
assert.equal((await run('https://t/', { APP_ENV: 'test', TEST_ACCESS_PASSWORD: 'slapt' })).status, 401);
assert.equal((await run('https://t/', { APP_ENV: 'test', TEST_ACCESS_PASSWORD: 'slapt' }, basic('blogas'))).status, 401);
const ok = await run('https://t/', { APP_ENV: 'test', TEST_ACCESS_PASSWORD: 'slapt' }, basic('slapt'));
assert.equal(ok.status, 200);
assert.equal(ok.headers.get('X-Frame-Options'), 'DENY');
assert.equal(ok.headers.get('X-Robots-Tag'), 'noindex, nofollow');
assert.match(ok.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
const prod = await run('https://t/', { APP_ENV: 'production' });
assert.equal(prod.status, 200);
assert.equal(prod.headers.get('X-Robots-Tag'), null);
assert.equal((await run('https://t/db/schema.sql', { APP_ENV: 'production' })).status, 404);
assert.equal((await run('https://t/functions/_lib/crypto.js', { APP_ENV: 'production' })).status, 404);
const err = await onRequest({ request: new Request('https://t/api/x'), env: { APP_ENV: 'production' }, next: async () => { throw new Error('boom'); } });
assert.equal(err.status, 500);
assert.equal(err.headers.get('Cache-Control'), 'no-store');
console.log('Visi middleware testai praėjo');
