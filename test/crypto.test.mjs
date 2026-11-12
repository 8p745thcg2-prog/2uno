import assert from 'node:assert/strict';
import * as c from '../functions/_lib/crypto.js';

const env = { MASTER_KEY: c.b64encode(crypto.getRandomValues(new Uint8Array(32))) };
const plain = new TextEncoder().encode('Sutartis Nr. 1 – UAB „Testas“');

const box = await c.encryptBytes(env, plain, 'contract:abc');
assert.notDeepEqual(box.ciphertext.slice(12), plain);
const back = await c.decryptBytes(env, box, 'contract:abc');
assert.equal(new TextDecoder().decode(back), 'Sutartis Nr. 1 – UAB „Testas“');

await assert.rejects(c.decryptBytes(env, box, 'contract:kitas'));
const tampered = { ...box, ciphertext: box.ciphertext.slice() };
tampered.ciphertext[20] ^= 1;
await assert.rejects(c.decryptBytes(env, tampered, 'contract:abc'));
await assert.rejects(c.decryptBytes({ MASTER_KEY: c.b64encode(crypto.getRandomValues(new Uint8Array(32))) }, box, 'contract:abc'));

const f = await c.encryptField(env, 'Įmonės kodas 123456789', 'req:1');
assert.match(f, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
assert.equal(await c.decryptField(env, f, 'req:1'), 'Įmonės kodas 123456789');
assert.equal(await c.encryptField(env, null), null);

const a = await c.encryptField(env, 'x'), b = await c.encryptField(env, 'x');
assert.notEqual(a, b);

assert.equal(c.safeEqual('abc', 'abc'), true);
assert.equal(c.safeEqual('abc', 'abd'), false);
assert.equal(c.safeEqual('abc', 'abcd'), false);
assert.equal(c.randomId().length, 24);
assert.equal((await c.sha256Hex(new TextEncoder().encode('abc'))).slice(0, 8), 'ba7816bf');

await assert.rejects(c.encryptBytes({}, plain));
await assert.rejects(c.encryptBytes({ MASTER_KEY: 'trumpas' }, plain));
console.log('Visi šifravimo testai praėjo');
