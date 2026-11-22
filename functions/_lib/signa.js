// Signa Platform (MitSoft) el. parašo integracija.
// Aplinkos paslaptys (Cloudflare Pages secrets – reikia nustatyti ATSKIRAI "dev" (Preview) ir
// "2uno.lt" (Production) aplinkoms, kad veiktų abiejose):
//   SIGNA_CID              – kliento ID, suteiktas MitSoft (pvz. "v5Zs49a6QEIFqeqYoJyK").
//   SIGNA_BASE_URL         – nebūtina kol IP nepatvirtintas; KAI Arūnas patvirtins fiksuotą IP ir
//                            bus žinomas proxy adresas, čia turės būti ĖJO (proxy) adresas, NE
//                            tiesiai signa.mitsoft.lt – žr. paaiškinimą žemiau.
//   SIGNA_PUBLIC_BASE_URL  – nebūtina; numatytoji reikšmė jau yra tikras Signa Platform adresas.
//   SIGNA_DOC_SPEC_ID      – dokumento specifikacijos ID. TODO: patvirtinti su Arūnu Stočkumi
//                            (MitSoft), kokią reikšmę naudoti paprastam PDF dokumentui – šiuo
//                            metu spėjama "PDF".
//
// SVARBU – du skirtingi adresai:
// 1) REST operacijos (store/initSign/download), kurias kviečia MŪSŲ SERVERIS – jų kreipimasis
//    tikrinamas pagal IP (whitelisting pagal cid), tad kai Arūnas patvirtins fiksuotą IP
//    (34.66.99.68, per Google Cloud proxy), SIGNA_BASE_URL reikės nukreipti per tą proxy.
// 2) "sign" operacija (naršyklės nukreipimas) – ją tiesiogiai atidaro KLIENTO naršyklė iš JO PAČIO
//    IP, ne mūsų serveris, todėl IP whitelisting jai netaikomas ir ji visada turi eiti tiesiai į
//    tikrą signa.mitsoft.lt adresą (SIGNA_PUBLIC_BASE_URL), NIEKADA per proxy – priešingu atveju
//    klientas būtų nukreiptas į adresą, kuris nerodo pasirašymo vartotojo sąsajos.
const DEFAULT_BASE = 'https://signa.mitsoft.lt/signa-platform';

export function signaEnabled(env) {
  return !!env.SIGNA_CID;
}

// Serverio REST kvietimams (store/initSign/download) – gali tapti proxy adresu.
function baseUrl(env) {
  return String(env.SIGNA_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

// Kliento naršyklės nukreipimui (sign) – visada tikras Signa Platform adresas.
function publicBaseUrl(env) {
  return String(env.SIGNA_PUBLIC_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
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
// Tyčia naudoja publicBaseUrl(), NE baseUrl() – žr. paaiškinimą failo viršuje.
export function signUrl(env, signExtUid, { ln = 'lt' } = {}) {
  return `${publicBaseUrl(env)}/app/api/da/link/sign/${encodeURIComponent(signExtUid)}?ln=${encodeURIComponent(ln)}`;
}

// Atsisiunčia anksčiau patalpintą dokumentą (operacija "download"). PDF formatui turinio failas
// ir visas dokumentas yra tas pats, todėl contentId nenurodomas. SVARBU: šis endpoint'as grąžina
// dokumentą nepriklausomai nuo to, ar jis jau pasirašytas – kviesti tik gavus patikimą signalą,
// kad pasirašymas įvyko (žr. _lib/signa-check.js ir api/sign/signa.js callback'ą), o ne kiekvieno
// kliento naršyklės užklausimo metu.
export async function downloadDocument(env, docExtUid) {
  const body = new URLSearchParams({ cid: cid(env), docExtUid });
  const r = await fetch(`${baseUrl(env)}/app/api/rs/link/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(`Signa download klaida: ${r.status} ${d.message || JSON.stringify(d)}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}
