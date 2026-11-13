import { requireAdmin } from '../../../../_lib/admin-auth.js';
import { unlockPartnerUser } from '../../../../_lib/auth.js';
import { json, readJson, notFound } from '../../../../_lib/http.js';

// POST /api/admin/partners/:id/unlock { email } – atrakina užrakintą įmonės darbuotojo prisijungimą.
export async function onRequestPost({ request, env, params }) {
  const { session, error } = await requireAdmin(request, env, { write: true });
  if (error) return error;
  let body;
  try { body = await readJson(request, 1024); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const u = await env.DB.prepare('SELECT id FROM partner_users WHERE partner_id = ? AND email = ?').bind(String(params.id || ''), email).first();
  if (!u) return notFound();
  await unlockPartnerUser(env, u.id, session.adminId);
  return json({ ok: true });
}
