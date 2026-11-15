import { json, readJson, sameOrigin } from '../../_lib/http.js';
import { sha256Hex } from '../../_lib/crypto.js';

// POST /api/waitlist/confirm { t } – patvirtina el. paštą (nuoroda iš laiško).
// Patvirtinama tik paspaudus mygtuką puslapyje, kad pašto filtrai, atidarantys nuorodas, nepatvirtintų patys.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body;
  try { body = await readJson(request, 1024); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const t = String(body.t || '');
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(t)) return json({ error: 'Nuoroda netinkama arba pasibaigusi' }, 400);
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    'UPDATE waitlist SET confirmed_at = ?, token_hash = NULL, token_expires_at = NULL WHERE token_hash = ? AND token_expires_at > ?'
  ).bind(now, await sha256Hex(new TextEncoder().encode(t)), now).run();
  if (!r.meta || !r.meta.changes) return json({ error: 'Nuoroda netinkama arba pasibaigusi' }, 400);
  return json({ ok: true });
}
