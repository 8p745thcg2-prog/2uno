import { createAdminCode } from '../../_lib/admin-auth.js';
import { json, readJson, sameOrigin, isProduction, audit } from '../../_lib/http.js';
import { sendMail, loginCodeMail } from '../../_lib/mail.js';
import { verifyTurnstile, TURNSTILE_ERROR } from '../../_lib/turnstile.js';

// POST /api/admin/login { email } – kodas el. paštu. Atsakymas visada vienodas.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body;
  try { body = await readJson(request, 2048); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  if (!(await verifyTurnstile(env, body.turnstile, request))) return json({ error: TURNSTILE_ERROR }, 403);
  const r = await createAdminCode(env, body.email);
  const res = { ok: true, message: 'Jei šis adresas turi administratoriaus teises, išsiuntėme 6 skaitmenų kodą.' };
  if (r.ok) {
    const mail = loginCodeMail(r.code);
    mail.subject = `Administratoriaus prisijungimo kodas: ${r.code}`;
    const sent = await sendMail(env, { to: String(body.email).trim().toLowerCase(), ...mail });
    await audit(env, { actorType: 'admin', actorId: r.adminId, action: sent.ok ? 'admin_code_sent' : `admin_code_fail:${sent.error}`, request });
    if (!isProduction(env) && !sent.ok) res.devCode = r.code; // tik jei paštas neveikia testinėje aplinkoje
  }
  if (r.tooSoon) res.message = 'Kodas jau išsiųstas. Naują galima gauti po minutės.';
  return json(res);
}
