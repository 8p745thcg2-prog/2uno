import { getAdminSession, verifyTotp } from '../../_lib/admin-auth.js';
import { json, readJson, sameOrigin, audit } from '../../_lib/http.js';

// POST /api/admin/totp-verify { code } – 2 žingsnis.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  const s = await getAdminSession(request, env);
  if (!s) return json({ error: 'Reikia prisijungti' }, 401);
  let body;
  try { body = await readJson(request, 1024); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const r = await verifyTotp(env, s, body.code);
  if (r.error) {
    await audit(env, { actorType: 'admin', actorId: s.adminId, action: 'admin_totp_fail', request });
    return json({ error: r.error }, 401);
  }
  await audit(env, { actorType: 'admin', actorId: s.adminId, action: r.setup ? 'admin_totp_enabled' : 'admin_login', request });
  return json({ ok: true });
}
