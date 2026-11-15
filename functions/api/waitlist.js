// POST /api/waitlist { email, consent, turnstile } – laikinas laukiančiųjų sąrašas, kol nėra duomenų bazės:
// adresas su sutikimo laiku išsiunčiamas į info@2uno.lt. Užsiregistravusiam laiškas nesiunčiamas.
const RESEND = 'https://api.resend.com/emails';
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

function sameOrigin(request) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function human(env, token, request) {
  if (!env.TURNSTILE_SECRET) return false; // be apsaugos nuo robotų nepriimama
  const t = String(token || '');
  if (!t || t.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', t);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  try {
    const d = await (await fetch(VERIFY, { method: 'POST', body: form })).json();
    return d.success === true;
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return json({ error: 'Netinkami duomenys' }, 400);
  let body;
  try {
    const text = await request.text();
    if (text.length > 4096) throw new Error('per didelė');
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Netinkami duomenys' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(email)) return json({ error: 'Neteisingas el. pašto adresas' }, 400);
  if (body.consent !== true) return json({ error: 'Pažymėkite, kad sutinkate gauti pranešimą' }, 400);
  if (!(await human(env, body.turnstile, request))) return json({ error: 'Patvirtinkite, kad nesate robotas, ir bandykite dar kartą.' }, 403);
  if (!env.RESEND_API_KEY) return json({ error: 'Registracija laikinai neveikia. Rašykite info@2uno.lt' }, 503);

  const at = new Date().toISOString();
  const text = `Naujas užsiregistravęs laukiančiųjų sąraše: ${email}\nSutikimas gauti pranešimą apie paleidimą: ${at}\n\n2uno.lt`;
  const r = await fetch(RESEND, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `waitlist-${email}` },
    body: JSON.stringify({ from: '2uno.lt <pranesimai@2uno.lt>', to: ['info@2uno.lt'], subject: `Laukiančiųjų sąrašas: ${email}`, text }),
  }).catch(() => null);
  if (!r || !r.ok) return json({ error: 'Nepavyko užregistruoti. Bandykite vėliau arba rašykite info@2uno.lt' }, 502);
  return json({ ok: true });
}
