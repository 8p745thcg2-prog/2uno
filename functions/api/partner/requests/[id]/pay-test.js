import { requirePartner, loadRequest, presentRequest } from '../../../../_lib/partner.js';
import { json, notFound, isProduction, audit } from '../../../../_lib/http.js';
import { randomId } from '../../../../_lib/crypto.js';

// POST /api/partner/requests/:id/pay-test – TIK TESTINĖJE APLINKOJE imituoja Paysera patvirtinimą.
// Tikroje sistemoje būseną keis tik pasirašytas Paysera callback.
export async function onRequestPost({ request, env, params }) {
  if (isProduction(env)) return notFound();
  const { session, error } = await requirePartner(request, env, { write: true });
  if (error) return error;
  const r = await loadRequest(env, params.id, session.partnerId);
  if (!r) return notFound();
  if (r.status !== 'laukia_apmokejimo') return json({ error: 'Šios užklausos apmokėti negalima' }, 409);
  if (r.deadline_at && r.deadline_at < new Date().toISOString()) {
    await env.DB.prepare("UPDATE requests SET status = 'pasibaige_terminas', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), r.id).run();
    return json({ error: 'Terminas pasibaigė' }, 409);
  }
  const now = new Date().toISOString();
  const upd = await env.DB.prepare(
    "UPDATE requests SET status = 'apmoketa', updated_at = ? WHERE id = ? AND partner_id = ? AND status = 'laukia_apmokejimo'"
  ).bind(now, r.id, session.partnerId).run();
  if (upd.meta && upd.meta.changes === 0) return json({ error: 'Būsena jau pasikeitė' }, 409);
  await env.DB.prepare(
    "INSERT INTO payments (id, request_id, provider, provider_order_id, amount_cents, status, paid_at) VALUES (?, ?, 'test', ?, ?, 'apmoketa', ?)"
  ).bind(randomId(), r.id, 'TEST-' + randomId(9), 20000, now).run();
  await audit(env, { actorType: 'provider', action: 'payment_confirmed_test', objectType: 'request', objectId: r.id, request });
  return json(await presentRequest(env, await loadRequest(env, r.id, session.partnerId)));
}
