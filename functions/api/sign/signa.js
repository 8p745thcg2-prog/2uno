import { json } from '../../_lib/http.js';
import { signaEnabled } from '../../_lib/signa.js';
import { completeIfSignedSigna } from '../../_lib/signa-check.js';

// POST /api/sign/signa – Signa Platform praneša apie pasirašomo dokumento būsenos pasikeitimą
// (operacija "callback" – žr. _lib/signa.js). Pranešimas ateina be parašo/autentifikacijos, todėl
// jo turiniu tik orientuojamasi, kad dokumentas galėjo būti pasirašytas; tikras užbaigimas vyksta
// completeIfSignedSigna() viduje, atsisiunčiant dokumentą tiesiai iš Signa Platform (kai bus
// integruota "download" operacija – žr. _lib/signa-check.js TODO).
export async function onRequestPost({ request, env, waitUntil }) {
  if (!signaEnabled(env)) return json({ ok: true });
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: true });
  }
  const extUid = String((body && body.extUid) || '');
  if (!extUid) return json({ ok: true });

  const c = await env.DB.prepare('SELECT id, request_id FROM contracts WHERE id = ? AND signing_provider = ?')
    .bind(extUid, 'signa').first();
  if (!c) return json({ ok: true });

  const events = Array.isArray(body.events) ? body.events : [];
  const signedNow = body.lastEventCode === 'sign' || events.some((e) => e && e.code === 'sign' && e.status === 'P');
  if (signedNow) {
    await completeIfSignedSigna(env, {
      contractId: c.id, requestId: c.request_id, docExtUid: extUid,
      origin: new URL(request.url).origin, waitUntil,
    }).catch((e) => console.error('Signa callback klaida', e && e.message));
  }
  return json({ ok: true });
}
