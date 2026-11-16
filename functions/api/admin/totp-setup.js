import { getAdminSession, startTotpSetup } from '../../_lib/admin-auth.js';
import { json, sameOrigin, audit } from '../../_lib/http.js';

// POST /api/admin/totp-setup – tik pirmą kartą, kol programėlė dar nenustatyta.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  const s = await getAdminSession(request, env);
  if (!s) return json({ error: 'Reikia prisijungti' }, 401);
  if (s.hasTotp) return json({ error: 'Programėlė jau nustatyta' }, 409);
  await audit(env, { actorType: 'admin', actorId: s.adminId, action: 'admin_totp_setup_started', request });
  return json(await startTotpSetup(env, s));
}
