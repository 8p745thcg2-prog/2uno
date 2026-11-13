// Cloudflare Turnstile: patikrina, kad formą pateikė žmogus, o ne robotas.
// Slaptas raktas – Cloudflare paslaptis TURNSTILE_SECRET. Jei jis nenustatytas (pvz. vietiniuose testuose), patikra praleidžiama.
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(env, token, request) {
  if (!env.TURNSTILE_SECRET) return true;
  const t = String(token || '');
  if (!t || t.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', t);
  const ip = request && request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  try {
    const r = await fetch(VERIFY, { method: 'POST', body: form });
    const d = await r.json();
    return d.success === true;
  } catch {
    return false;
  }
}

export const TURNSTILE_ERROR = 'Patvirtinkite, kad nesate robotas, ir bandykite dar kartą.';
