import { requireAdmin } from '../../../_lib/admin-auth.js';
import { STATUS_LABELS } from '../../../_lib/partner.js';
import { decryptField } from '../../../_lib/crypto.js';
import { json, notFound, audit } from '../../../_lib/http.js';

// GET /api/admin/requests/:id – visa informacija, įskaitant kliento duomenis (peržiūra įrašoma į žurnalą).
export async function onRequestGet({ request, env, params }) {
  const { session, error } = await requireAdmin(request, env);
  if (error) return error;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(params.id || ''))) return notFound();
  const r = await env.DB.prepare(
    `SELECT r.*, p.name AS partner_name, c.client_signed_at, c.partner_signed_at, c.delete_after, c.deleted_at
       FROM requests r LEFT JOIN partners p ON p.id = r.partner_id LEFT JOIN contracts c ON c.request_id = r.id
      WHERE r.id = ?`
  ).bind(params.id).first();
  if (!r) return notFound();
  let client = null;
  try { client = r.client_enc ? JSON.parse(await decryptField(env, r.client_enc, `request:${r.id}`)) : null; } catch { client = null; }
  const { results: payments = [] } = await env.DB.prepare(
    'SELECT provider, amount_cents, status, paid_at FROM payments WHERE request_id = ? ORDER BY created_at'
  ).bind(r.id).all();
  const { results: log = [] } = await env.DB.prepare(
    "SELECT at, actor_type, action FROM audit_log WHERE object_type = 'request' AND object_id = ? ORDER BY id"
  ).bind(r.id).all();
  await audit(env, { actorType: 'admin', actorId: session.adminId, action: 'admin_view_client', objectType: 'request', objectId: r.id, request });
  return json({
    id: r.id, status: r.status, statusLabel: STATUS_LABELS[r.status] || r.status,
    summary: JSON.parse(r.summary || '{}'), priceEur: r.price_eur, deadlineAt: r.deadline_at,
    createdAt: r.created_at, updatedAt: r.updated_at, reminderSentAt: r.reminder_sent_at,
    partnerId: r.partner_id, partnerName: r.partner_name, client,
    contract: { clientSignedAt: r.client_signed_at, partnerSignedAt: r.partner_signed_at, deleteAfter: r.delete_after, deletedAt: r.deleted_at },
    payments: payments.map((p) => ({ provider: p.provider, amountEur: p.amount_cents / 100, status: p.status, paidAt: p.paid_at })),
    log,
  });
}
