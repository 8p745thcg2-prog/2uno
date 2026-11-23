import { safeEqual } from './_lib/crypto.js';

// Keliai, kurie niekada neturi būti pasiekiami naršyklėje (serverio kodas, schema).
const BLOCKED = [
  /^\/functions(\/|$)/, /^\/db(\/|$)/, /^\/test(\/|$)/, /^\/_lib(\/|$)/,
  /^\/\.git/, /^\/README-dev/, /^\/package\.json$/, /^\/cron(\/|$)/,
];

// index.html (3), buhalteriams.html (1), partnerio-paskyra.html (1) įterptinių skriptų SHA-256.
export const INLINE_SCRIPT_HASHES = [
  "'sha256-9+wHIGrOttBGVx38YeuFtb+yJQtJyPhRVm2cZuEKZQY='",
  "'sha256-ZEcKaPEsyA0/3sDbe/Q0efuYdIzw68GhWbkukRXiGDU='",
  "'sha256-GctPturq1sts0NsV+Cowsebf+6QURvQ6G2oUkOeNRcY='",
  "'sha256-jn3kRDjkRhiZOgf7/v8vzWzyFo+sGJyK4PAHsUPGyDg='",
  "'sha256-aOfsd+xRVtvuARa/4YL1YP2gOPQEpmHXgEzozx6ZRJg='",
  "'sha256-REVYJn0BEP3HW5wd6y5JMdLLHUGl2MY3QZm3Eq6ZF7o='",
];

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Skriptai leidžiami tik iš savo svetainės ir Turnstile. Keli įterptiniai skriptai pagrindiniuose
  // puslapiuose leidžiami tik pagal tikslų turinio kontrolinį kodą (pakeitus jų tekstą, kodą reikia atnaujinti –
  // tai tikrina test/csp.test.mjs).
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' " + INLINE_SCRIPT_HASHES.join(' ') + " https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self' https://www.paysera.com https://bank.paysera.com",
    "frame-src 'self' https://challenges.cloudflare.com https://gateway-sandbox.dokobit.com https://gateway.dokobit.com https://signa.mitsoft.lt",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
};

// Saugus numatytasis režimas: testinės funkcijos veikia tik su APP_ENV=test.
function isProduction(env) {
  return env.APP_ENV !== 'test';
}

function unauthorized() {
  return new Response('Testinė aplinka. Reikalingas prisijungimas.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="2uno test", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}

// Testinė aplinka uždaryta slaptažodžiu. Jei slaptažodis nenustatytas,
// aplinka neatidaroma visai (saugiau, nei palikti ją atvirą).
function checkTestAccess(request, env) {
  if (env.APP_ENV === 'production') return null;
  // Nežinoma aplinka arba testinė be slaptažodžio – neatidaroma visai.
  if (env.APP_ENV !== 'test' || !env.TEST_ACCESS_PASSWORD) {
    return new Response('Testinė aplinka nesukonfigūruota.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return unauthorized();
  let decoded = '';
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), (c) => c.charCodeAt(0)));
  } catch {
    return unauthorized();
  }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return safeEqual(password, env.TEST_ACCESS_PASSWORD) ? null : unauthorized();
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (BLOCKED.some((re) => re.test(url.pathname))) {
    return new Response('Not found', { status: 404 });
  }

  // Demonstraciniai puslapiai prieinami tik testinėje aplinkoje.
  if (isProduction(env) && /^\/(demo-|assets\/demo-|api\/demo\/)/.test(url.pathname)) {
    return new Response('Not found', { status: 404 });
  }

  // Suplanuotos užduoties kreipinys tikrinamas savo slaptu raktu (žr. functions/api/cron), ne testinės aplinkos slaptažodžiu.
  // Dokobit pranešimas taip pat ateina be testinės aplinkos slaptažodžio; jo turiniu nepasitikima (žr. functions/api/sign).
  // Paysera webhook'as taip pat ateina be testinės aplinkos slaptažodžio (Paysera jo nežino); jo turiniu taip pat
  // nepasitikima – serveris pats patikrina užsakymo būseną per Paysera OAuth (žr. functions/api/payments/paysera-webhook).
  // Signa Platform callback'as (el. parašas) taip pat ateina be testinės aplinkos slaptažodžio (žr. functions/api/sign/signa.js).
  const isSystemCallback = request.method === 'POST' && (
    url.pathname === '/api/cron/reminders' ||
    url.pathname === '/api/sign/dokobit' ||
    url.pathname === '/api/sign/signa' ||
    url.pathname === '/api/payments/paysera-webhook'
  );
  const denied = isSystemCallback ? null : checkTestAccess(request, env);
  if (denied) return denied;

  let response;
  try {
    response = await next();
  } catch (err) {
    console.error('Klaida:', err && err.stack ? err.stack : err);
    response = new Response(JSON.stringify({ error: 'Vidinė klaida' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  response = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  // /api/sign/signa-return yra puslapis, į kurį Signa Platform nukreipia MŪSŲ PAČIŲ puslapyje
  // (pasirasymas.html) įterptą <iframe> pasirašymo pabaigoje (žr. functions/api/sign/signa-return.js).
  // Numatytieji "X-Frame-Options: DENY" / "frame-ancestors 'none'" aukščiau uždraudžia bet kokį
  // įkėlimą <iframe>'e – ĮSKAITANT mūsų pačių puslapį mūsų pačių iframe'e, todėl be šios išimties
  // naršyklė po pasirašymo rodo tuščią/sulūžusį lauką vietoj "Pasirašymas užbaigtas" pranešimo.
  // Leidžiama tik šiam vienam keliui ir tik to paties domeno (SAMEORIGIN / 'self') rėmeliui.
  if (url.pathname === '/api/sign/signa-return') {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set(
      'Content-Security-Policy',
      response.headers.get('Content-Security-Policy').replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
    );
  }
  if (!isProduction(env)) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (url.pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'no-store');
  return response;
}
