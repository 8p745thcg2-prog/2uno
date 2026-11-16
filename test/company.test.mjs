import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { lookupCompany } from '../functions/_lib/company.js';

const shard = gzipSync('121215433\tKita, AB\tKur nors\t320\n121215434\tTelia Lietuva, AB\tLvivo g. 25, Vilnius\t320\n');
let calls = [];
const mock = (map) => async (url) => {
  const u = String(url); calls.push(u);
  for (const [k, v] of map) if (u.includes(k)) return typeof v === 'function' ? v() : new Response(v);
  return new Response('nėra', { status: 404 });
};

// 1. Randama vietiniame žinyne – su adresu, be lėto API
globalThis.fetch = mock([['/data/jar/12121.tsv.gz', () => new Response(shard)], ['/data/jar/meta.json', JSON.stringify({ forms: { 320: 'Akcinė bendrovė' } })]]);
let r = await lookupCompany('121215434');
assert.equal(r.found, true); assert.equal(r.name, 'Telia Lietuva, AB'); assert.equal(r.address, 'Lvivo g. 25, Vilnius');
assert.equal(r.legalFormShort, 'AB'); assert.equal(r.legalForm, 'Akcinė bendrovė');
assert.ok(!calls.some((c) => c.includes('get.data.gov.lt')));

// 2. Žinyne nėra (nauja įmonė) – atsarginis API
calls = [];
globalThis.fetch = mock([['/data/jar/', () => new Response('', { status: 404 })], ['JuridinisAsmuo', JSON.stringify({ _data: [{ ja_kodas: 306000001, ja_pavadinimas: 'Nauja', isreg_data: null, forma: { _id: 'f' } }] })], ['/Forma/', JSON.stringify({ kodas: 960, pavadinimas: 'Mažoji bendrija' })]]);
r = await lookupCompany('306000001');
assert.equal(r.found, true); assert.equal(r.name, 'Nauja'); assert.equal(r.legalFormShort, 'MB'); assert.equal(r.address, undefined);

// 3. Niekur nėra / tinklo klaida – „nerasta“, rankinis įvedimas
globalThis.fetch = async () => { throw new Error('tinklas'); };
assert.equal((await lookupCompany('999999999')).found, false);
console.log('Visi įmonės paieškos testai praėjo');
