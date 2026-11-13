// Partnerių prisijungimas vienkartiniu el. pašto kodu ir sesijos.
import { sha256Hex, b64encode, safeEqual } from './crypto.js';

export const SESSION_COOKIE = '__Host-2uno_s';
const SESSION_HOURS = 12;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DAILY_MAX_FAILS = 15; // per parą: tikimybė atspėti 6 skaitmenų kodą lieka ~0,0015 %
const enc = new TextEncoder();

export function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

async function codeHash(env, email, code) {
  return sha256Hex(enc.encode(`login:${email}:${code}:${env.MASTER_KEY || ''}`));
}

const nowIso = () => new Date().toISOString();
const plus = (min) => new Date(Date.now() + min * 60e3).toISOString();

// Nesėkmingi bandymai per paskutines 24 val. (skaičiuojami iš nekeičiamo žurnalo),
// neįskaitant tų, kurie buvo prieš administratorės atrakinimą.
export async function failsLastDay(env, actorType, actorId) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM audit_log
      WHERE actor_type = ? AND actor_id = ? AND action = 'login_fail' AND at > ?
        AND at > COALESCE((SELECT MAX(at) FROM audit_log WHERE object_type = ? AND object_id = ? AND action = 'login_unlocked'), '')`
  ).bind(actorType, actorId, new Date(Date.now() - 864e5).toISOString(), actorType + '_user', actorId).first();
  return (r && r.n) || 0;
}

// Administratorė atrakina partnerio darbuotojo prisijungimą.
export async function unlockPartnerUser(env, userId, adminId) {
  await env.DB.batch([
    env.DB.prepare('UPDATE partner_users SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(userId),
    env.DB.prepare("INSERT INTO audit_log (actor_type, actor_id, action, object_type, object_id) VALUES ('admin', ?, 'login_unlocked', 'partner_user', ?)").bind(adminId, userId),
  ]);
}
export const DAY_LOCK_MSG = 'Per daug nesėkmingų bandymų. Pabandykite po 24 val. arba rašykite info@2uno.lt.';

// Sukuria kodą. Grąžina { code } arba { error } (kodas grąžinamas tik tam, kad jį būtų galima išsiųsti).
export async function createLoginCode(env, emailRaw) {
  const email = normEmail(emailRaw);
  const user = await env.DB.prepare('SELECT id, locked_until FROM partner_users WHERE email = ?').bind(email).first();
  if (!user) return { ok: false };
  if (user.locked_until && user.locked_until > nowIso()) return { ok: false, locked: true };
  if (await failsLastDay(env, 'partner', user.id) >= DAILY_MAX_FAILS) return { ok: false, locked: true };
  const recent = await env.DB.prepare(
    'SELECT created_at FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(email).first();
  if (recent && recent.created_at > new Date(Date.now() - 60e3).toISOString()) return { ok: false, tooSoon: true };
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(n).padStart(6, '0');
  await env.DB.prepare('INSERT INTO login_codes (email, code_hash, expires_at) VALUES (?, ?, ?)')
    .bind(email, await codeHash(env, email, code), plus(CODE_MINUTES)).run();
  return { ok: true, code, userId: user.id };
}

// Patikrina kodą ir sukuria sesiją. Grąžina { token, userId } arba { error }.
export async function verifyLoginCode(env, emailRaw, codeRaw) {
  const email = normEmail(emailRaw);
  const code = String(codeRaw || '').trim();
  const user = await env.DB.prepare('SELECT id, partner_id, failed_logins, locked_until FROM partner_users WHERE email = ?').bind(email).first();
  if (!user || !/^\d{6}$/.test(code)) return { error: 'Neteisingas kodas' };
  if (user.locked_until && user.locked_until > nowIso()) return { error: 'Per daug bandymų. Pabandykite po 15 min.' };
  if (await failsLastDay(env, 'partner', user.id) >= DAILY_MAX_FAILS) return { error: DAY_LOCK_MSG };

  const row = await env.DB.prepare(
    'SELECT id, code_hash FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).bind(email, nowIso()).first();
  const good = row && safeEqual(row.code_hash, await codeHash(env, email, code));
  if (!good) {
    const fails = (user.failed_logins || 0) + 1;
    const lock = fails >= MAX_ATTEMPTS ? plus(LOCK_MINUTES) : null;
    await env.DB.prepare('UPDATE partner_users SET failed_logins = ?, locked_until = ? WHERE id = ?')
      .bind(lock ? 0 : fails, lock, user.id).run();
    await env.DB.prepare("INSERT INTO audit_log (actor_type, actor_id, action) VALUES ('partner', ?, 'login_fail')").bind(user.id).run();
    return { error: lock ? 'Per daug bandymų. Pabandykite po 15 min.' : 'Neteisingas arba nebegaliojantis kodas' };
  }

  const token = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('UPDATE login_codes SET used_at = ? WHERE id = ?').bind(nowIso(), row.id),
    env.DB.prepare('UPDATE partner_users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').bind(nowIso(), user.id),
    env.DB.prepare("INSERT INTO sessions (id, user_id, role, expires_at) VALUES (?, ?, 'partner', ?)")
      .bind(await sha256Hex(enc.encode(token)), user.id, plus(SESSION_HOURS * 60)),
  ]);
  return { token, userId: user.id, partnerId: user.partner_id };
}

export function sessionCookie(token, maxAgeSec = SESSION_HOURS * 3600) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

function readCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

// Grąžina { userId, partnerId, email, partnerName } arba null.
export async function getPartnerSession(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const s = await env.DB.prepare(
    `SELECT u.id AS userId, u.partner_id AS partnerId, u.email, p.name AS partnerName
       FROM sessions s JOIN partner_users u ON u.id = s.user_id JOIN partners p ON p.id = u.partner_id
      WHERE s.id = ? AND s.role = 'partner' AND s.expires_at > ?`
  ).bind(await sha256Hex(enc.encode(token)), nowIso()).first();
  return s || null;
}

export async function endSession(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(enc.encode(token))).run();
}
