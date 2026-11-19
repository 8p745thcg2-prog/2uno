import { requirePartner, loadRequest } from '../../../../_lib/partner.js';
import { json, notFound } from '../../../../_lib/http.js';

// LAIKINAS diagnostikos endpointas – bus pašalintas po patikrinimo.
// GET /api/partner/requests/:id/debug-payments
export async function onRequestGet({ request, env, params }) {
  const { session, error } = await requirePartner(request, env, {});
  if (error) return error;
  const r = await loadRequest(env, params.id, session.partnerId);
  if (!r) return notFound();
  const pays = await env.DB.prepare(
    'SELECT id, provider, provider_order_id, provider_payment_id, amount_cents, currency, status, paid_at, created_at FROM payments WHERE request_id = ? ORDER BY created_at DESC'
  ).bind(r.id).all();
  const audits = await env.DB.prepare(
    "SELECT action, object_type, object_id, created_at FROM audit_log WHERE object_id = ? OR object_id = ? ORDER BY created_at DESC LIMIT 20"
  ).bind(r.id, r.id).all().catch((e) => ({ error: String(e && e.message) }));
  return json({ requestId: r.id, requestStatus: r.status, payments: pays.results, audits: audits.results || audits });
}
