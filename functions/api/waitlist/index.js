import { json, readJson, sameOrigin, audit } from '../../_lib/http.js';
import { sha256Hex, randomId } from '../../_lib/crypto.js';
import { sendMail, waitlistConfirmMail } from '../../_lib/mail.js';
import { verifyTurnstile, TURNSTILE_ERROR } from '../../_lib/turnstile.js';

const TOKEN_HOURS = 48;
const RESEND_MINUTES = 10;
const OK = { ok: true, message: 'Išsiuntėme laišką. Paspauskite jame esančią nuorodą, kad patvirtintumėte el. paštą.' };

// POST /api/waitlist { email, consent, turnstile } – įrašo į laukiančiųjų sąrašą ir siunčia patvirtinimo laišką.
// Atsakymas visada vienodas, kad nebūtų galima sužinoti, kurie adresai jau sąraše.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body;
  try { body = await readJson(request, 4096); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Neteisingas el. pašto adresas' }, 400);
  if (body.consent !== true) return json({ error: 'Pažymėkite, kad sutinkate gauti pranešimą' }, 400);
  if (!(await verifyTurnstile(env, body.turnstile, request))) return json({ error: TURNSTILE_ERROR }, 403);

  const now = new Date();
  const row = await env.DB.prepare('SELECT confirmed_at, unsubscribed_at, last_mail_at FROM waitlist WHERE email = ?').bind(email).first();
  if (row && row.confirmed_at && !row.unsubscribed_at) return json(OK);
  if (row && row.last_mail_at && row.last_mail_at > new Date(now.getTime() - RESEND_MINUTES * 60e3).toISOString()) return json(OK);

  const token = randomId(32);
  const hash = await sha256Hex(new TextEncoder().encode(token));
  const expires = new Date(now.getTime() + TOKEN_HOURS * 3600e3).toISOString();
  await env.DB.prepare(
    `INSERT INTO waitlist (email, token_hash, token_expires_at, last_mail_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET token_hash = excluded.token_hash, token_expires_at = excluded.token_expires_at,
       last_mail_at = excluded.last_mail_at, unsubscribed_at = NULL, confirmed_at = NULL`
  ).bind(email, hash, expires, now.toISOString()).run();
  const origin = new URL(request.url).origin;
  const sent = await sendMail(env, { to: email, ...waitlistConfirmMail(`${origin}/netrukus?t=${token}`) });
  await audit(env, { actorType: 'system', action: sent.ok ? 'mail_waitlist_ok' : `mail_waitlist_fail:${sent.error}`, request });
  return json(OK);
}
