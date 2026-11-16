import { json } from '../../_lib/http.js';
import { sha256Hex } from '../../_lib/crypto.js';
import { dokobitEnabled } from '../../_lib/dokobit.js';
import { completeIfSigned } from '../../_lib/sign-check.js';

// POST /api/sign/dokobit – Dokobit praneša apie pasirašymą (postback).
// Pranešimo turiniu nepasitikima: būsena ir failas visada paimami tiesiai iš Dokobit API.
export async function onRequestPost({ request, env, waitUntil }) {
  if (!dokobitEnabled(env)) return json({ ok: true });
  let token = '';
  const type = request.headers.get('Content-Type') || '';
  try {
    if (type.includes('application/json')) token = String((await request.json()).token || '');
    else token = String((await request.formData()).get('token') || '');
  } catch { return json({ ok: true }); }
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(token)) return json({ ok: true });
  const c = await env.DB.prepare('SELECT id, request_id FROM contracts WHERE signing_lookup = ?')
    .bind(await sha256Hex(new TextEncoder().encode('dokobit:' + token))).first();
  if (!c) return json({ ok: true });
  await completeIfSigned(env, { contractId: c.id, requestId: c.request_id, signingToken: token, origin: new URL(request.url).origin, waitUntil });
  return json({ ok: true });
}
