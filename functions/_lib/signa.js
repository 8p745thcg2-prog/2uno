// Signa Platform (MitSoft) el. parašo integracija.
// Aplinkos paslaptys (Cloudflare Pages secrets – reikia nustatyti ATSKIRAI "dev" (Preview) ir
// "2uno.lt" (Production) aplinkoms, kad veiktų abiejose):
//   SIGNA_CID              – kliento ID, suteiktas MitSoft (pvz. "v5Zs49a6QEIFqeqYoJyK").
//   SIGNA_BASE_URL         – kai REST kvietimai turi eiti per fiksuoto IP proxy (Google Cloud VM,
//                            34.66.99.68), čia nurodomas proxy adresas (pvz.
//                            "http://34.66.99.68:8443") BE jokio kelio priedo – proxy pats prideda
//                            "/signa-platform" dalį prie kelio, kurį mes siunčiame ("/app/api/...").
//   SIGNA_PROXY_SECRET     – proxy reikalaujama bendroji paslaptis; siunčiama kaip "X-Proxy-Auth"
//                            antraštė KIEKVIENAME REST kvietime, kitaip proxy atmeta su 403.
//                            PRIVALO sutapti su proxy serviso aplinkos kintamuoju PROXY_SECRET.
//   SIGNA_PUBLIC_BASE_URL  – nebūtina; numatytoji reikšmė jau yra tikras Signa Platform adresas.
//   SIGNA_DOC_SPEC_ID      – dokumento specifikacijos ID (formato identifikatorius). Numatytoji
//                            reikšmė "PDF-PAdES-TS" – paprastas PDF su laiko žyma, be PDF/A
//                            reikalavimo (žr. MitSoft dokumentų formatų aprašą). Kitas galimas
//                            formatas – "PDF-LT-V1.0", bet jam reikalaujama, kad pradinis failas
//                            būtų PDF/A-1 ar aukštesnės versijos, todėl jis mums netinka be
//                            papildomos PDF/A konversijos.
//
// SVARBU – du skirtingi adresai:
// 1) REST operacijos (store/initSign/download), kurias kviečia MŪSŲ SERVERIS – jų kreipimasis
//    tikrinamas pagal IP (whitelisting pagal cid). IP 34.66.99.68 (Google Cloud proxy) Arūno
//    PATVIRTINTAS cid "v5Zs49a6QEIFqeqYoJyK" (patikrinta tiesiog paklausus Signa API per proxy –
//    2026-11-22 grąžino klaidą tik dėl multipart formato, ne dėl IP/cid), todėl SIGNA_BASE_URL
//    turi būti nukreiptas per tą proxy (žr. SIGNA_BASE_URL aukščiau).
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

// Antraštė, kurią reikalauja fiksuoto IP proxy (žr. SIGNA_PROXY_SECRET aukščiau). Jei
// SIGNA_BASE_URL nukreiptas tiesiai į signa.mitsoft.lt (proxy nenaudojamas), ši antraštė
// paprasčiausiai nesiunčiama – tikrasis Signa Platform serveris jos nepaiso.
function proxyHeaders(env) {
  return env.SIGNA_PROXY_SECRET ? { 'X-Proxy-Auth': env.SIGNA_PROXY_SECRET } : {};
}

// LAIKINA diagnostika (žr. functions/api/debug-env.js) – tiesiogiai bando pasiekti proxy iš
// Worker'io su tikru antrašte, kad atskirtume: ar problema pačiame SIGNA_PROXY_SECRET, ar
// Cloudflare Worker'io išeinančio fetch() negalėjime pasiekti plain-HTTP adreso ne-standartiniu
// prievadu. Pašalinti kartu su debug-env.js.
export async function proxyPing(env) {
  const url = `${baseUrl(env)}/app/api/rs/link/store`;
  try {
    const r = await fetch(url, { method: 'POST', headers: proxyHeaders(env) });
    const text = await r.text().catch(() => '');
    return { ok: true, status: r.status, bodySnippet: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// Patalpina dokumentą į Signa Platform pasirašymui (operacija "store").
// docExtUid – mūsų sutarties ID (contracts.id). docTitle – PRIVALOMAS kuriant naują dokumentą
// (taikoma ADOC/PDF-LT/PDF formatams). callbackUrl – mūsų endpoint'as, į kurį Signa vėliau praneš
// apie būsenos pasikeitimus (žr. functions/api/sign/signa.js).
export async function storeDocument(env, { docExtUid, docTitle, pdfBytes, fileName, callbackUrl }) {
  const fd = new FormData();
  fd.set('cid', cid(env));
  fd.set('docExtUid', docExtUid);
  fd.set('docSpecId', env.SIGNA_DOC_SPEC_ID || 'PDF-PAdES-TS');
  fd.set('docTitle', docTitle);
  fd.set('callbackUrl', callbackUrl);
  // docFileSort1 = "cnt" (turinio failas) – tai ir yra numatytoji reikšmė, jei šio parametro
  // visai nenurodytume, tad ją nurodome tik dėl aiškumo. NIEKADA nerašyti čia skaičiaus/indekso –
  // šis parametras nurodo failo RŪŠĮ, leistinos reikšmės yra tik main/annx/attc/cnt/edoc.
  fd.set('docFileElem1', new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
  fd.set('docFileSort1', 'cnt');
  const r = await fetch(`${baseUrl(env)}/app/api/rs/link/store`, { method: 'POST', headers: proxyHeaders(env), body: fd });
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', ...proxyHeaders(env) },
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', ...proxyHeaders(env) },
    body,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(`Signa download klaida: ${r.status} ${d.message || JSON.stringify(d)}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}
