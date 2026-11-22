import { json, notFound, isProduction } from '../_lib/http.js';
import { signaEnabled, proxyPing } from '../_lib/signa.js';
import { dokobitEnabled } from '../_lib/dokobit.js';

// LAIKINAS diagnostikos endpoint'as (tik testinei aplinkai, isProduction() apsauga).
// Nerodo jokių slaptų reikšmių ištisai – tik ar jos aptinkamos (true/false) ir, Signa proxy
// atveju, paskutinius 4 simbolius bei SIGNA_BASE_URL hostą (be prievado/schemos), kad būtų
// galima atskirti, ar Preview deploy'as perskaitė NAUJĄ paslapties reikšmę po rotacijos, ar
// vis dar naudoja seną. Papildomai – tiesioginis proxyPing() bandymas pasiekti proxy iš paties
// Worker'io, kad atskirtume: ar problema pačiame SIGNA_PROXY_SECRET, ar Cloudflare Worker'io
// išeinančio fetch() negalėjime pasiekti plain-HTTP adreso ne-standartiniu prievadu (8443).
// Pašalinti, kai Signa integracija bus patvirtinta veikianti.
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
