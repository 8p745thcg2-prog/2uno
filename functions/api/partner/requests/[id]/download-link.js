import { requirePartner, loadRequest, UNLOCKED } from '../../../../_lib/partner.js';
import { json, notFound } from '../../../../_lib/http.js';
import { b64encode, sha256Hex } from '../../../../_lib/crypto.js';

// POST /api/partner/requests/:id/download-link – vienkartinė 15 min. nuoroda, tik atrakintoms sutartims.
export async function onRequestPost({ request, env, params }) {
  const { session, error } = await requirePartner(request, env, { write: true });
  if (error) return error;
  const r = await loadRequest(env, params.id, session.partnerId);
  if (!r || !r.contract_id || r.contract_deleted) return notFound();
  if (!UNLOCKED.includes(r.status)) return json({ error: 'Sutartis atrakinama po apmokėjimo' }, 403);
  const token = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + 15 * 60e3).toISOString();
  await env.DB.prepare('INSERT INTO download_tokens (token_hash, contract_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(new TextEncoder().encode(token)), r.contract_id, expires).run();
  return json({ url: `/api/partner/contracts/${r.contract_id}/download?t=${token}`, expiresAt: expires });
}
