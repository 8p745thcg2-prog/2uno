import { verifyAdminCode, adminCookie } from '../../_lib/admin-auth.js';
import { json, readJson, sameOrigin, audit } from '../../_lib/http.js';

// POST /api/admin/verify { email, code } – 1 žingsnis baigtas, toliau reikia programėlės kodo.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body;
  try { body = await readJson(request, 2048); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const r = await verifyAdminCode(env, body.email, body.code);
  if (r.error) return json({ error: r.error }, 401);
  await audit(env, { actorType: 'admin', actorId: r.adminId, action: 'admin_login_step1', request });
  const res = json({ ok: true, needsSetup: r.needsSetup });
  res.headers.append('Set-Cookie', adminCookie(r.token));
  return res;
}
