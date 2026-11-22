import { json, notFound, isProduction } from '../_lib/http.js';
import { signaEnabled, proxyPing } from '../_lib/signa.js';
import { dokobitEnabled } from '../_lib/dokobit.js';

// LAIKINAS diagnostikos endpoint'as (tik testinei aplinkai, isProduction() apsauga).
// Nerodo jokių slaptų reikšmių ištisai – tik ar jos aptinkamos (true/false) ir, Signa proxy
// atveju, paskutinius 4 simbolius bei SIGNA_BASE_URL hostą (be prievado/schemos), kad būtų
// galima atskirti, ar Preview deploy'as perskaitė NAUJĄ paslapties reikšmę po rotacijos, ar
// vis dar naudoja seną. Papildomai – tiesioginis proxyPing() bandymas pasiekti proxy iš paties
// Worker'io gyvo veikimo diagnostikai.
//
// SIGNA INTEGRACIJA PATVIRTINTA VEIKIANTI 2026-11-22 18:35 UTC (audit_log id 221,
// signing_started_signa, signExtUid "IlFJZOsyBgoahAl0eFEyTk3b" - naršyklė sėkmingai
// nukreipta į tikrą Signa Platform pasirašymo sąsają).
//
// Ankstesnė "prievadas 8443 yra Cloudflare rezervuotas" teorija PASIRODĖ KLAIDINGA. Tikra
// 401 noPermission klaidos priežastis: proxy.py (Google Cloud VM 34.66.99.68) aklai
// persiųsdavo Cloudflare Worker'io automatiškai pridedamą "X-Forwarded-For" antraštę (su
// Cloudflare edge IP) į Signa, o Signa whitelist tikrinimui naudoja šią antraštę, ne tikrą
// TCP ryšio IP. Sprendimas: proxy.py nufiltruoja "cf-*"/"x-forwarded-*"/"cdn-loop"/"forwarded"
// antraštes prieš persiunčiant į Signa. Pilnas paaiškinimas: functions/_lib/signa.js viršuje.
// Galutinė veikianti SIGNA_BASE_URL reikšmė: "http://34.66.99.68.nip.io:8444".
//
// Pašalinti šį endpoint'ą (ir proxyPing() iš signa.js), kai integracija bus patvirtinta
// veikianti su tikru pasirašymu (realiu Smart-ID/mobiliuoju parašu/asmens tapatybės kortele).
export async function onRequestGet({ env }) {
  if (isProduction(env)) return notFound();
  let baseUrlHost = null;
  try { baseUrlHost = env.SIGNA_BASE_URL ? new URL(env.SIGNA_BASE_URL).host : null; } catch {}
  const ping = env.SIGNA_BASE_URL ? await proxyPing(env) : null;
  return json({
    appEnv: env.APP_ENV || null,
    signaCidSet: signaEnabled(env),
    signaBaseUrlSet: !!env.SIGNA_BASE_URL,
    signaBaseUrlHost: baseUrlHost,
    signaProxySecretSet: !!env.SIGNA_PROXY_SECRET,
    signaProxySecretTail: env.SIGNA_PROXY_SECRET ? env.SIGNA_PROXY_SECRET.slice(-4) : null,
    signaProxySecretLen: env.SIGNA_PROXY_SECRET ? env.SIGNA_PROXY_SECRET.length : null,
    proxyPing: ping,
    dokobitSet: dokobitEnabled(env),
  });
}
