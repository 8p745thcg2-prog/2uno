import { createLoginCode, normEmail } from '../../_lib/auth.js';
import { json, readJson, sameOrigin, isProduction, audit } from '../../_lib/http.js';

// POST /api/partner/login { email } – išsiunčia vienkartinį kodą.
// Atsakymas visada vienodas, kad nebūtų galima sužinoti, kurie el. paštai užregistruoti.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body;
  try { body = await readJson(request, 2048); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const email = normEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Neteisingas el. paštas' }, 400);

  const r = await createLoginCode(env, email);
  const res = { ok: true, message: 'Jei šis el. paštas užregistruotas, išsiuntėme 6 skaitmenų kodą. Jis galioja 10 min.' };
  if (r.ok) {
    await audit(env, { actorType: 'partner', actorId: r.userId, action: 'login_code_sent', request });
    // TODO: el. laiškų siuntimas. Kol jis neprijungtas, testinėje aplinkoje kodas rodomas ekrane.
    if (!isProduction(env)) res.devCode = r.code;
  }
  if (r.tooSoon) res.message = 'Kodas jau išsiųstas. Naują galima gauti po minutės.';
  return json(res);
}
