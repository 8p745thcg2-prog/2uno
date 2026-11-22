// Signa Platform (MitSoft) el. parašo integracija.
// Aplinkos paslaptys (Cloudflare Pages secrets – reikia nustatyti ATSKIRAI "dev" (Preview) ir
// "2uno.lt" (Production) aplinkoms, kad veiktų abiejose):
//   SIGNA_CID          – kliento ID, suteiktas MitSoft (pvz. "v5Zs49a6QEIFqeqYoJyK").
//   SIGNA_BASE_URL      – nebūtina; numatytoji reikšmė žemiau.
//   SIGNA_DOC_SPEC_ID   – dokumento specifikacijos ID. TODO: patvirtinti su Arūnu Stočkumi (MitSoft),
//                         kokią reikšmę naudoti paprastam PDF dokumentui – šiuo metu spėjama "PDF".
//
// SVARBU: Signa Platform reikalauja, kad užklausos ateitų iš iš anksto patvirtinto (whitelisted) IP
// adreso pagal cid. Šios funkcijos kviečiamos per fiksuoto IP tarpinį serverį (Google Cloud proxy,
// IP 34.66.99.68) – jei SIGNA_BASE_URL nukreipia tiesiai į signa.mitsoft.lt, o ne per tą proxy,
// užklausos bus atmestos, kol IP nebus įtrauktas į leidžiamų sąrašą.

const DEFAULT_BASE = 'https://signa.mitsoft.lt/signa-platform';

export function signaEnabled(env) {
  return !!env.SIGNA_CID;
}

function baseUrl(env) {
  return String(env.SIGNA_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

function cid(env) {
  return env.SIGNA_CID || 'default';
}

// Patalpina dokumentą į Signa Platform pasirašymui (operacija "store").
// docExtUid – mūsų sutarties ID (contracts.id). callbackUrl – mūsų endpoint'as, į kurį Signa
// vėliau praneš apie būsenos pasikeitimus (žr. functions/api/sign/signa.js).
export async function storeDocument(env, { docExtUid, pdfBytes, fileName, callbackUrl }) {
  const fd = new FormData();
  fd.set('cid', cid(env));
  fd.set('docExtUid', docExtUid);
  fd.set('docSpecId', env.SIGNA_DOC_SPEC_ID || 'PDF');
  fd.set('callbackUrl', callbackUrl);
  fd.set('docFileElem1', new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
  fd.set('docFileSort1', '1');
  const r = await fetch(`${baseUrl(env)}/app/api/rs/link/store`, { method: 'POST', body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.status !== 'success') throw new Error(`Signa store klaida: ${r.status} ${JSON.stringify(d)}`);
  return d;
}

// Paruošia patalpintą dokumentą pasirašymui integruojančios sistemos naudotojui (operacija
// "initSign", variantas A – pasirašantysis nėra registruotas Signa Platform sistemoje).
// Grąžina { status, signExtUid }.
export async function initSign(env, { docExtUid, signerId, signerFirstName, signerLastName, signerSerialIds, postbackUrl, ln = 'lt' }) {
  const body = new URLSearchParams({
    cid: cid(env),
    docExtUid,
    signerType: 'I',
    signerId,
    signerFirstName,
    signerLastName,
    postbackUrl,
    ln,
  });
  if (signerSerialIds) body.set('signerSerialIds', signerSerialIds);
  const r = await fetch(`${baseUrl(env)}/app/api/rs/link/initSign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.status !== 'success' || !d.signExtUid) throw new Error(`Signa initSign klaida: ${r.status} ${JSON.stringify(d)}`);
  return d;
}

// Nuoroda, į kurią nukreipiama kliento naršyklė (ar iframe) pasirašymui atlikti (operacija "sign").
export function signUrl(env, signExtUid, { ln = 'lt' } = {}) {
  return `${baseUrl(env)}/app/api/da/link/sign/${encodeURIComponent(signExtUid)}?ln=${encodeURIComponent(ln)}`;
}
