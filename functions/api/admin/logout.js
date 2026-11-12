import { endAdminSession, adminCookie } from '../../_lib/admin-auth.js';
import { json, sameOrigin } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  await endAdminSession(request, env);
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', adminCookie('', 0));
  return res;
}
