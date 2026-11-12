import { requirePartner, UNLOCKED } from '../../../../_lib/partner.js';
import { json, notFound, audit } from '../../../../_lib/http.js';
import { decryptBytes, sha256Hex } from '../../../../_lib/crypto.js';

// GET /api/partner/contracts/:id/download?t=... – reikia ir prisijungimo, ir vienkartinio žetono.
export async function onRequestGet({ request, env, params }) {
  const { session, error } = await requirePartner(request, env);
  if (error) return error;
  const id = String(params.id || '');
  const token = new URL(request.url).searchParams.get('t') || '';
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(id) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return notFound();

  const c = await env.DB.prepare(
    `SELECT c.file_key, c.wrapped_key, c.sha256, c.deleted_at, r.status, r.partner_id
       FROM contracts c JOIN requests r ON r.id = c.request_id WHERE c.id = ?`
  ).bind(id).first();
  if (!c || c.partner_id !== session.partnerId || c.deleted_at) return notFound();
  if (!UNLOCKED.includes(c.status)) return json({ error: 'Sutartis užrakinta' }, 403);

  const now = new Date().toISOString();
  const used = await env.DB.prepare(
    'UPDATE download_tokens SET used_at = ? WHERE token_hash = ? AND contract_id = ? AND used_at IS NULL AND expires_at > ? RETURNING contract_id'
  ).bind(now, await sha256Hex(new TextEncoder().encode(token)), id, now).first();
  if (!used) return json({ error: 'Nuoroda nebegalioja' }, 410);

  const obj = await env.CONTRACTS.get(c.file_key);
  if (!obj) return notFound();
  const pdf = await decryptBytes(env, { wrappedKey: c.wrapped_key, ciphertext: new Uint8Array(await obj.arrayBuffer()) }, `contract:${id}`);
  if ((await sha256Hex(pdf)) !== c.sha256) return json({ error: 'Failo vientisumo klaida' }, 500);
  await audit(env, { actorType: 'partner', actorId: session.userId, action: 'contract_downloaded', objectType: 'contract', objectId: id, request });
  return new Response(pdf, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="2uno-sutartis.pdf"', 'Cache-Control': 'no-store' },
  });
}
