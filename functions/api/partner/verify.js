import { verifyLoginCode, sessionCookie } from '../../_lib/auth.js';
import { json, readJson, sameOrigin, audit } from '../../_lib/http.js';

// POST /api/partner/verify { email, code } – patikrina kodą ir sukuria 12 val. sesiją.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body;
  try { body = await readJson(request, 2048); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const r = await verifyLoginCode(env, body.email, body.code);
  if (r.error) return json({ error: r.error }, 401);
  await audit(env, { actorType: 'partner', actorId: r.userId, action: 'login', request });
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', sessionCookie(r.token));
  return res;
}
