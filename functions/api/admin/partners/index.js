import { requireAdmin } from '../../../_lib/admin-auth.js';
import { randomId } from '../../../_lib/crypto.js';
import { json, readJson, audit } from '../../../_lib/http.js';
import { validatePartner, syncUsers } from '../../../_lib/partner-admin.js';
import { failsLastDay } from '../../../_lib/auth.js';

// GET /api/admin/partners – įmonių sąrašas su naudotojais ir praleistais terminais per 30 d.
export async function onRequestGet({ request, env }) {
  const { error } = await requireAdmin(request, env);
  if (error) return error;
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { results = [] } = await env.DB.prepare(
    `SELECT p.id, p.name, p.company_code, p.notify_emails, p.active, p.created_at,
            (SELECT COUNT(*) FROM requests r WHERE r.partner_id = p.id AND r.status = 'pasibaige_terminas' AND r.updated_at > ?) AS late30,
            (SELECT COUNT(*) FROM requests r WHERE r.partner_id = p.id AND r.status = 'laukia_apmokejimo') AS waiting,
            (SELECT COUNT(*) FROM requests r WHERE r.partner_id = p.id AND r.status IN ('apmoketa','pasirasyta')) AS won
       FROM partners p ORDER BY p.name`
  ).bind(since).all();
  const { results: users = [] } = await env.DB.prepare('SELECT id, partner_id, email, last_login_at, locked_until FROM partner_users ORDER BY email').all();
  const now = new Date().toISOString();
  for (const u of users) {
    // Užrakinta: 15 min. po 5 klaidų arba parai po 15 klaidų per 24 val.
    u.locked = !!(u.locked_until && u.locked_until > now) || (await failsLastDay(env, 'partner', u.id)) >= 15;
  }
  return json({
    partners: results.map((p) => ({
      id: p.id, name: p.name, companyCode: p.company_code || '', notifyEmails: JSON.parse(p.notify_emails || '[]'),
      active: !!p.active, late30: p.late30, waiting: p.waiting, won: p.won,
      users: users.filter((u) => u.partner_id === p.id).map((u) => ({ email: u.email, lastLoginAt: u.last_login_at, locked: u.locked })),
    })),
  });
}

// POST /api/admin/partners – nauja įmonė.
export async function onRequestPost({ request, env }) {
  const { session, error } = await requireAdmin(request, env, { write: true });
  if (error) return error;
  let body;
  try { body = await readJson(request, 8 * 1024); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const v = validatePartner(body);
  if (!v.ok) return json({ error: 'Patikrinkite laukus', fields: v.errors }, 422);
  const id = randomId(12);
  await env.DB.prepare('INSERT INTO partners (id, name, company_code, notify_emails, active) VALUES (?, ?, ?, ?, ?)')
    .bind(id, v.data.name, v.data.companyCode || null, JSON.stringify(v.data.notifyEmails), v.data.active).run();
  const u = await syncUsers(env, id, v.data.userEmails);
  await audit(env, { actorType: 'admin', actorId: session.adminId, action: 'partner_created', objectType: 'partner', objectId: id, request });
  if (u.error) return json({ id, warning: u.error }, 201);
  return json({ id }, 201);
}
