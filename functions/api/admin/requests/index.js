import { requireAdmin } from '../../../_lib/admin-auth.js';
import { STATUS_LABELS } from '../../../_lib/partner.js';
import { json } from '../../../_lib/http.js';

// GET /api/admin/requests?status=&partner= – visų užklausų sąrašas be kliento duomenų.
export async function onRequestGet({ request, env }) {
  const { error } = await requireAdmin(request, env);
  if (error) return error;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const partner = url.searchParams.get('partner') || '';
  const where = [];
  const args = [];
  if (status && STATUS_LABELS[status]) { where.push('r.status = ?'); args.push(status); }
  if (partner) { where.push('r.partner_id = ?'); args.push(partner); }
  const { results = [] } = await env.DB.prepare(
    `SELECT r.id, r.status, r.summary, r.price_eur, r.deadline_at, r.created_at, r.updated_at, r.partner_id, p.name AS partner_name
       FROM requests r LEFT JOIN partners p ON p.id = r.partner_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.created_at DESC LIMIT 200`
  ).bind(...args).all();
  return json({
    requests: results.map((r) => ({
      id: r.id, status: r.status, statusLabel: STATUS_LABELS[r.status] || r.status,
      number: JSON.parse(r.summary || '{}').number || '', priceEur: r.price_eur,
      deadlineAt: r.deadline_at, createdAt: r.created_at, updatedAt: r.updated_at,
      partnerId: r.partner_id, partnerName: r.partner_name,
    })),
  });
}
