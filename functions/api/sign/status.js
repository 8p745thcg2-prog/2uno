import { json, notFound } from '../../_lib/http.js';
import { sha256Hex, decryptField } from '../../_lib/crypto.js';
import { dokobitEnabled } from '../../_lib/dokobit.js';
import { completeIfSigned } from '../../_lib/sign-check.js';
import { clientDownloadToken } from '../../_lib/request-flow.js';

// GET /api/sign/status?t=<kliento būsenos žetonas> – pasirašymo puslapis klausia, ar parašas jau gautas.
// Jei Dokobit pranešimas dar neatėjo, būsena patikrinama tiesiogiai.
export async function onRequestGet({ request, env, waitUntil }) {
  const t = new URL(request.url).searchParams.get('t') || '';
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(t)) return notFound();
  const c = await env.DB.prepare(
    `SELECT c.id, c.request_id, c.signing_ref, r.status, r.summary FROM contracts c JOIN requests r ON r.id = c.request_id
      WHERE c.client_status_hash = ?`
  ).bind(await sha256Hex(new TextEncoder().encode(t))).first();
  if (!c) return notFound();
  let status = c.status;
  if (status === 'laukia_kliento_paraso' && dokobitEnabled(env)) {
    try {
      const token = await decryptField(env, c.signing_ref, `sign:${c.id}`);
      const r = await completeIfSigned(env, { contractId: c.id, requestId: c.request_id, signingToken: token, origin: new URL(request.url).origin, waitUntil });
      if (r.signed) status = 'laukia_apmokejimo';
    } catch (e) {
      console.error('Būsenos tikrinimo klaida', e && e.message);
    }
  }
  const number = JSON.parse(c.summary || '{}').number;
  if (status === 'laukia_kliento_paraso') return json({ signed: false, number });
  // Žetonas vienkartinis: po pirmo „pasirašyta“ atsakymo jo nebereikia
  await env.DB.prepare('UPDATE contracts SET client_status_hash = NULL WHERE id = ?').bind(c.id).run();
  return json({ signed: true, number, downloadUrl: await clientDownloadToken(env, c.id) });
}
