import { getAdminSession } from '../../_lib/admin-auth.js';
import { json } from '../../_lib/http.js';

// GET /api/admin/me – prisijungimo būsena (kuris žingsnis liko).
export async function onRequestGet({ request, env }) {
  const s = await getAdminSession(request, env);
  if (!s) return json({ error: 'Reikia prisijungti' }, 401);
  return json({ email: s.email, mfaOk: s.mfaOk, hasTotp: s.hasTotp });
}
