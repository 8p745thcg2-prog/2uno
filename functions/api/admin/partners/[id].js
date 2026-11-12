import { requireAdmin } from '../../../_lib/admin-auth.js';
import { json, readJson, notFound, audit } from '../../../_lib/http.js';
import { validatePartner, syncUsers } from '../../../_lib/partner-admin.js';

// POST /api/admin/partners/:id – keičia įmonės duomenis, naudotojus ir ar ji rodoma.
export async function onRequestPost({ request, env, params }) {
  const { session, error } = await requireAdmin(request, env, { write: true });
  if (error) return error;
  const p = await env.DB.prepare('SELECT id, active FROM partners WHERE id = ?').bind(String(params.id || '')).first();
  if (!p) return notFound();
  let body;
  try { body = await readJson(request, 8 * 1024); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const v = validatePartner(body);
  if (!v.ok) return json({ error: 'Patikrinkite laukus', fields: v.errors }, 422);
  const u = await syncUsers(env, p.id, v.data.userEmails);
  if (u.error) return json({ error: u.error, fields: { userEmails: u.error } }, 409);
  await env.DB.prepare('UPDATE partners SET name = ?, company_code = ?, notify_emails = ?, active = ? WHERE id = ?')
    .bind(v.data.name, v.data.companyCode || null, JSON.stringify(v.data.notifyEmails), v.data.active, p.id).run();
  const action = p.active && !v.data.active ? 'partner_hidden' : !p.active && v.data.active ? 'partner_shown' : 'partner_updated';
  await audit(env, { actorType: 'admin', actorId: session.adminId, action, objectType: 'partner', objectId: p.id, request });
  return json({ ok: true });
}
