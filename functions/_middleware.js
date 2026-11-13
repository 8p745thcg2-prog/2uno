import { safeEqual } from './_lib/crypto.js';

// Keliai, kurie niekada neturi būti pasiekiami naršyklėje (serverio kodas, schema).
const BLOCKED = [
  /^\/functions(\/|$)/, /^\/db(\/|$)/, /^\/test(\/|$)/, /^\/_lib(\/|$)/,
  /^\/\.git/, /^\/README-dev/, /^\/package\.json$/, /^\/cron(\/|$)/,
];

// index.html (4), buhalteriams.html (1), partnerio-paskyra.html (1) įterptinių skriptų SHA-256.
export const INLINE_SCRIPT_HASHES = [
  "'sha256-P25jVaQ7LBEeAXCMvmvnHzyT38vO6LKC1VwMf+PqgSE='",
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
    "frame-src 'self' https://challenges.cloudflare.com https://gateway-sandbox.dokobit.com https://gateway.dokobit.com",
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
  const isCron = request.method === 'POST' && (url.pathname === '/api/cron/reminders' || url.pathname === '/api/sign/dokobit');
  const denied = isCron ? null : checkTestAccess(request, env);
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

  // Testinėje aplinkoje į pagrindinį puslapį įterpiama jungtis su pasirašymo puslapiu.
  if (!isProduction(env) && (url.pathname === '/' || url.pathname === '/index.html') &&
      (response.headers.get('Content-Type') || '').includes('text/html') && typeof HTMLRewriter !== 'undefined') {
    response = new HTMLRewriter()
      .on('body', { element(el) { el.append('<script src="/assets/sign-bridge.js" defer></script>', { html: true }); } })
      .transform(response);
  }

  response = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  if (!isProduction(env)) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (url.pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'no-store');
  return response;
}
