import { requirePartner, loadRequest } from '../../../../_lib/partner.js';
import { json, notFound, audit } from '../../../../_lib/http.js';

// POST /api/partner/requests/:id/decline – partneris atsisako kliento (iki apmokėjimo).
export async function onRequestPost({ request, env, params }) {
  const { session, error } = await requirePartner(request, env, { write: true });
  if (error) return error;
  const r = await loadRequest(env, params.id, session.partnerId);
  if (!r) return notFound();
  if (r.status !== 'laukia_apmokejimo') return json({ error: 'Šios užklausos atsisakyti negalima' }, 409);
  await env.DB.prepare("UPDATE requests SET status = 'partneris_atsisake', updated_at = ? WHERE id = ? AND partner_id = ?")
    .bind(new Date().toISOString(), r.id, session.partnerId).run();
  await audit(env, { actorType: 'partner', actorId: session.userId, action: 'request_declined', objectType: 'request', objectId: r.id, request });
  return json({ ok: true });
}
