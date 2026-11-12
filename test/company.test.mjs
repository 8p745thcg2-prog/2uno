import assert from 'node:assert/strict';
import { lookupCompany } from '../functions/_lib/company.js';
globalThis.fetch = async (url) => {
  const u = String(url);
  const body = u.includes('JuridinisAsmuo') ? { _data: [{ ja_kodas: 121215434, ja_pavadinimas: 'Telia Lietuva, AB', reg_data: '1992-02-06', isreg_data: null, forma: { _id: 'f1' } }] }
    : u.includes('/Forma/') ? { kodas: 320, pavadinimas: 'Akcinė bendrovė' }
    : u.includes('vies') ? { isValid: true, name: 'Telia Lietuva, AB', address: 'Saltoniškių g. 7A,\nVilniaus m.' } : null;
  return new Response(JSON.stringify(body), { status: body ? 200 : 404 });
};
const r = await lookupCompany('121215434', 'LT212154314');
assert.equal(r.name, 'Telia Lietuva, AB'); assert.equal(r.legalFormShort, 'AB'); assert.equal(r.active, true);
assert.equal(r.address, 'Saltoniškių g. 7A, Vilniaus m.'); assert.equal(r.vatCode, 'LT212154314');
globalThis.fetch = async () => new Response('{"_data":[]}');
const n = await lookupCompany('999999999');
assert.equal(n.found, false);
globalThis.fetch = async () => { throw new Error('tinklas'); };
assert.equal((await lookupCompany('121215434')).found, false);
console.log('Visi įmonės paieškos testai praėjo');
