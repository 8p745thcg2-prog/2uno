import { requirePartner, loadRequest, presentRequest } from '../../../../_lib/partner.js';
import { json, notFound, audit } from '../../../../_lib/http.js';

// GET /api/partner/requests/:id – iki apmokėjimo tik santrauka, po apmokėjimo ir kliento duomenys.
export async function onRequestGet({ request, env, params }) {
  const { session, error } = await requirePartner(request, env);
  if (error) return error;
  const r = await loadRequest(env, params.id, session.partnerId);
  if (!r) return notFound();
  const out = await presentRequest(env, r);
  if (out.unlocked) await audit(env, { actorType: 'partner', actorId: session.userId, action: 'request_viewed', objectType: 'request', objectId: r.id, request });
  return json(out);
}
