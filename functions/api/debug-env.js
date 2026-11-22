import { json, notFound, isProduction } from '../_lib/http.js';
import { signaEnabled, proxyPing } from '../_lib/signa.js';
import { dokobitEnabled } from '../_lib/dokobit.js';

// LAIKINAS diagnostikos endpoint'as (tik testinei aplinkai, isProduction() apsauga).
// Nerodo jokių slaptų reikšmių ištisai – tik ar jos aptinkamos (true/false) ir, Signa proxy
// atveju, paskutinius 4 simbolius bei SIGNA_BASE_URL hostą (be prievado/schemos), kad būtų
// galima atskirti, ar Preview deploy'as perskaitė NAUJĄ paslapties reikšmę po rotacijos, ar
// vis dar naudoja seną. Papildomai – tiesioginis proxyPing() bandymas pasiekti proxy iš paties
// Worker'io, kad atskirtume: ar problema pačiame SIGNA_PROXY_SECRET, ar Cloudflare Worker'io
// išeinančio fetch() negalėjime pasiekti plain-HTTP adreso ne-standartiniu prievadu.
// Pašalinti, kai Signa integracija bus patvirtinta veikianti.
// (2026-11-22: SIGNA_BASE_URL dabar turi naudoti hostą "34.66.99.68.nip.io" IR prievadą 8444
// (NE 8443!) – 8443 yra VIENAS IŠ Cloudflare REZERVUOTŲ "HTTPS" prievadų (žr. Cloudflare
// dokumentaciją "Network ports": 443, 2053, 2083, 2087, 2096, 8443), todėl net ir Worker'io
// fetch() į mūsų PAČIŲ (ne Cloudflare zonos) VM tuo prievadu gaudavo atsakymą su Cloudflare'o
// pačios IP, ne mūsų VM IP. Proxy serviso prievadas VM pakeistas į 8444 ir atidaryta nauja
// užkardos (firewall) taisyklė. Taip pat NE raidinis IP (žr. "error code: 1003" / "Direct IP
// Access Not Allowed") ir NE 2uno.lt subdomenas (Workers viduje nukreipiamas per Cloudflare'o
// pačio tinklą tai pačiai zonai) – "nip.io" (<ip>.nip.io => <ip>, visiškai NESUSIJĘS su
// Cloudflare) + prievadas 8444 išsprendžia visas tris problemas vienu metu.)
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
