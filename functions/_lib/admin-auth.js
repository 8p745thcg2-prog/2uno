// Administratoriaus prisijungimas: 1) vienkartinis kodas el. paštu, 2) kodas iš autentifikavimo programėlės (TOTP).
// Administratoriai nustatomi aplinkos kintamuoju ADMIN_EMAILS (kableliais atskirti adresai).
import { sha256Hex, b64encode, safeEqual, encryptField, decryptField } from './crypto.js';
import { json, sameOrigin } from './http.js';
import { failsLastDay, DAY_LOCK_MSG } from './auth.js';

export const ADMIN_COOKIE = '__Host-2uno_a';
const PENDING_MINUTES = 10;   // laikas antram žingsniui
const SESSION_HOURS = 8;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DAILY_MAX_FAILS = 15;
const enc = new TextEncoder();
const nowIso = () => new Date().toISOString();
const plus = (min) => new Date(Date.now() + min * 60e3).toISOString();
const norm = (e) => String(e || '').trim().toLowerCase();

export function adminEmails(env) {
  return String(env.ADMIN_EMAILS || 'viktorija@2uno.lt').split(',').map(norm).filter(Boolean);
}

async function codeHash(env, email, code) {
  return sha256Hex(enc.encode(`admin-login:${email}:${code}:${env.MASTER_KEY || ''}`));
}

async function getOrCreateAdmin(env, email) {
  let u = await env.DB.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first();
  if (!u && adminEmails(env).includes(email)) {
    const id = b64encode(crypto.getRandomValues(new Uint8Array(12)));
    await env.DB.prepare('INSERT OR IGNORE INTO admin_users (id, email) VALUES (?, ?)').bind(id, email).run();
    u = await env.DB.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first();
  }
  return u && adminEmails(env).includes(u.email) ? u : null;
}

const locked = (u) => u.locked_until && u.locked_until > nowIso();
const dayLocked = async (env, u) => (await failsLastDay(env, 'admin', u.id)) >= DAILY_MAX_FAILS;

async function fail(env, u) {
  const fails = (u.failed_logins || 0) + 1;
  const lock = fails >= MAX_ATTEMPTS ? plus(LOCK_MINUTES) : null;
  await env.DB.prepare('UPDATE admin_users SET failed_logins = ?, locked_until = ? WHERE id = ?').bind(lock ? 0 : fails, lock, u.id).run();
  await env.DB.prepare("INSERT INTO audit_log (actor_type, actor_id, action) VALUES ('admin', ?, 'login_fail')").bind(u.id).run();
  return lock ? 'Per daug bandymų. Pabandykite po 15 min.' : 'Neteisingas kodas';
}

// 1 žingsnis: kodas el. paštu. Grąžina { ok, code? } – kodas tik tam, kad būtų išsiųstas.
export async function createAdminCode(env, emailRaw) {
  const email = norm(emailRaw);
  const u = await getOrCreateAdmin(env, email);
  if (!u || locked(u) || await dayLocked(env, u)) return { ok: false };
  const key = 'admin:' + email;
  const recent = await env.DB.prepare('SELECT created_at FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1').bind(key).first();
  if (recent && recent.created_at > new Date(Date.now() - 60e3).toISOString()) return { ok: false, tooSoon: true };
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  await env.DB.prepare('INSERT INTO login_codes (email, code_hash, expires_at) VALUES (?, ?, ?)')
    .bind(key, await codeHash(env, email, code), plus(CODE_MINUTES)).run();
  return { ok: true, code, adminId: u.id };
}

// Patikrina el. pašto kodą ir sukuria NEPATVIRTINTĄ sesiją (reikia antro žingsnio).
export async function verifyAdminCode(env, emailRaw, codeRaw) {
  const email = norm(emailRaw);
  const code = String(codeRaw || '').trim();
  const u = await getOrCreateAdmin(env, email);
  if (!u || !/^\d{6}$/.test(code)) return { error: 'Neteisingas kodas' };
  if (locked(u)) return { error: 'Per daug bandymų. Pabandykite po 15 min.' };
  if (await dayLocked(env, u)) return { error: DAY_LOCK_MSG };
  const row = await env.DB.prepare(
    'SELECT id, code_hash FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).bind('admin:' + email, nowIso()).first();
  if (!row || !safeEqual(row.code_hash, await codeHash(env, email, code))) return { error: await fail(env, u) };
  const token = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('UPDATE login_codes SET used_at = ? WHERE id = ?').bind(nowIso(), row.id),
    env.DB.prepare("INSERT INTO sessions (id, user_id, role, expires_at, mfa_ok) VALUES (?, ?, 'admin', ?, 0)")
      .bind(await sha256Hex(enc.encode(token)), u.id, plus(PENDING_MINUTES)),
  ]);
  return { token, adminId: u.id, needsSetup: !u.totp_secret_enc };
}

export function adminCookie(token, maxAgeSec = SESSION_HOURS * 3600) {
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

// Grąžina { sessionId, adminId, email, mfaOk, hasTotp } arba null.
export async function getAdminSession(request, env) {
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const sid = await sha256Hex(enc.encode(token));
  const s = await env.DB.prepare(
    `SELECT s.id AS sessionId, s.mfa_ok AS mfaOk, a.id AS adminId, a.email, a.totp_secret_enc IS NOT NULL AS hasTotp
       FROM sessions s JOIN admin_users a ON a.id = s.user_id
      WHERE s.id = ? AND s.role = 'admin' AND s.expires_at > ?`
  ).bind(sid, nowIso()).first();
  if (!s || !adminEmails(env).includes(s.email)) return null;
  return { ...s, mfaOk: !!s.mfaOk, hasTotp: !!s.hasTotp };
}

// Visi administravimo veiksmai: tik po abiejų žingsnių.
export async function requireAdmin(request, env, { write = false } = {}) {
  if (write && !sameOrigin(request)) return { error: json({ error: 'Draudžiama' }, 403) };
  const s = await getAdminSession(request, env);
  if (!s || !s.mfaOk) return { error: json({ error: 'Reikia prisijungti' }, 401) };
  return { session: s };
}

export async function endAdminSession(request, env) {
  const token = readCookie(request, ADMIN_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(enc.encode(token))).run();
}

// ---------- TOTP (RFC 6238: 30 s, 6 skaitmenys, HMAC-SHA1) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of String(str).replace(/[\s=]/g, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('Netinkamas raktas');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export async function totpAt(secretB32, step) {
  const key = await crypto.subtle.importKey('raw', base32Decode(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(step));
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

// Leidžiamas ±1 žingsnio (30 s) nuokrypis; tas pats kodas antrą kartą nepriimamas.
export async function checkTotp(secretB32, code, lastStep = -1, now = Date.now()) {
  const step = Math.floor(now / 30000);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= lastStep) continue;
    if (safeEqual(await totpAt(secretB32, s), String(code))) return s;
  }
  return null;
}

// Naujas TOTP raktas (laikinas, kol nepatvirtintas pirmu kodu).
export async function startTotpSetup(env, s) {
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  await env.DB.prepare('UPDATE admin_users SET totp_pending_enc = ? WHERE id = ?')
    .bind(await encryptField(env, secret, `totp:${s.adminId}`), s.adminId).run();
  const label = encodeURIComponent(`2uno.lt:${s.email}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=2uno.lt&algorithm=SHA1&digits=6&period=30` };
}

// 2 žingsnis: programėlės kodas. Jei raktas dar tik nustatomas – patvirtina jį.
export async function verifyTotp(env, s, codeRaw) {
  const code = String(codeRaw || '').trim();
  const u = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(s.adminId).first();
  if (!u || locked(u)) return { error: 'Per daug bandymų. Pabandykite po 15 min.' };
  if (await dayLocked(env, u)) return { error: DAY_LOCK_MSG };
  if (!/^\d{6}$/.test(code)) return { error: await fail(env, u) };
  const setup = !u.totp_secret_enc;
  const stored = setup ? u.totp_pending_enc : u.totp_secret_enc;
  if (!stored) return { error: 'Pirmiausia nustatykite programėlę' };
  const secret = await decryptField(env, stored, `totp:${u.id}`);
  const step = await checkTotp(secret, code, u.totp_last_step ?? -1);
  if (step === null) return { error: await fail(env, u) };
  await env.DB.batch([
    setup
      ? env.DB.prepare('UPDATE admin_users SET totp_secret_enc = totp_pending_enc, totp_pending_enc = NULL, totp_last_step = ?, failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').bind(step, nowIso(), u.id)
      : env.DB.prepare('UPDATE admin_users SET totp_last_step = ?, failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').bind(step, nowIso(), u.id),
    env.DB.prepare('UPDATE sessions SET mfa_ok = 1, expires_at = ? WHERE id = ?').bind(plus(SESSION_HOURS * 60), s.sessionId),
  ]);
  return { ok: true, setup };
}
