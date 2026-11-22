import { json, notFound, isProduction } from '../_lib/http.js';
import { signaEnabled } from '../_lib/signa.js';
import { dokobitEnabled } from '../_lib/dokobit.js';

// LAIKINAS diagnostikos endpoint'as (tik testinei aplinkai, isProduction() apsauga).
// Nerodo jokių slaptų reikšmių – tik ar jos aptinkamos (true/false), kad būtų galima
// patikrinti, kodėl /api/requests pasirenka vidinį (imitacinį) parašą vietoj Signa.
// Pašalinti, kai Signa integracija bus patvirtinta veikianti.
// (Pakeitimo data: naujas deploy po SIGNA_PROXY_SECRET rotacijos Previews Base.)
export async function onRequestGet({ env }) {
  if (isProduction(env)) return notFound();
  return json({
    appEnv: env.APP_ENV || null,
    signaCidSet: signaEnabled(env),
    signaBaseUrlSet: !!env.SIGNA_BASE_URL,
    signaProxySecretSet: !!env.SIGNA_PROXY_SECRET,
    dokobitSet: dokobitEnabled(env),
  });
}
