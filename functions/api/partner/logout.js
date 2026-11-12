import { endSession, sessionCookie } from '../../_lib/auth.js';
import { json, sameOrigin } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  await endSession(request, env);
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', sessionCookie('', 0));
  return res;
}
