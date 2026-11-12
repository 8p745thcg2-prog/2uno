import { requirePartner, STATUS_LABELS, UNLOCKED } from '../../../_lib/partner.js';
import { json } from '../../../_lib/http.js';

// GET /api/partner/requests – tik šio partnerio užklausos, be kliento duomenų.
export async function onRequestGet({ request, env }) {
  const { session, error } = await requirePartner(request, env);
  if (error) return error;
  const { results } = await env.DB.prepare(
    `SELECT id, status, summary, price_eur, deadline_at, created_at FROM requests
      WHERE partner_id = ? AND status != 'juodrastis' ORDER BY created_at DESC LIMIT 200`
  ).bind(session.partnerId).all();
  return json({
    requests: (results || []).map((r) => ({
      id: r.id, status: r.status, statusLabel: STATUS_LABELS[r.status] || r.status, unlocked: UNLOCKED.includes(r.status),
      summary: JSON.parse(r.summary || '{}'), priceEur: r.price_eur, deadlineAt: r.deadline_at, createdAt: r.created_at,
    })),
  });
}
