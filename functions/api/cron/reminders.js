import { safeEqual, decryptField } from '../../_lib/crypto.js';
import { json, audit, isProduction } from '../../_lib/http.js';
import {
  sendMail, reminderMail, partnerRecipients, expiredClientMail, expiredPartnerMail, expiredAdminMail,
} from '../../_lib/mail.js';

const WINDOW_HOURS = 2;
const DEFAULT_ADMIN = 'viktorija@2uno.lt';

function parse(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

// Pasibaigus terminui: užklausa uždaroma, informuojami klientas, įmonė ir administratorė (sutarties 6.2 p.).
async function expire(env, origin, now) {
  const { results = [] } = await env.DB.prepare(
    `SELECT r.id, r.partner_id, r.summary, r.client_enc, p.name AS partner_name FROM requests r
       LEFT JOIN partners p ON p.id = r.partner_id
      WHERE r.status = 'laukia_apmokejimo' AND r.deadline_at <= ? LIMIT 50`
  ).bind(now.toISOString()).all();
  let expired = 0;
  for (const r of results) {
    const upd = await env.DB.prepare(
      "UPDATE requests SET status = 'pasibaige_terminas', updated_at = ? WHERE id = ? AND status = 'laukia_apmokejimo'"
    ).bind(now.toISOString(), r.id).run();
    if (!upd.meta || !upd.meta.changes) continue;
    expired++;
    await audit(env, { actorType: 'system', action: 'request_expired', objectType: 'request', objectId: r.id });

    const summary = parse(r.summary);
    const number = summary.number || r.id;
    const partnerName = r.partner_name || summary.providerName || 'Pasirinkta įmonė';
    let client = {};
    try { client = JSON.parse(await decryptField(env, r.client_enc, `request:${r.id}`)); } catch { client = {}; }
    const late = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM requests WHERE partner_id = ? AND status = 'pasibaige_terminas' AND updated_at > ?"
    ).bind(r.partner_id, new Date(now.getTime() - 30 * 864e5).toISOString()).first();

    const admin = env.ADMIN_EMAIL || DEFAULT_ADMIN;
    // Testinėje aplinkoje klientų adresai išgalvoti, todėl jiems skirtas laiškas siunčiamas administratorei.
    const clientMail = expiredClientMail({ origin, partnerName, number });
    const clientTo = isProduction(env) ? client.email : admin;
    if (!isProduction(env)) clientMail.subject = `[TESTAS – laiškas klientui] ${clientMail.subject}`;
    const jobs = [
      ['client', clientTo, clientMail],
      ['partner', await partnerRecipients(env, r.partner_id), expiredPartnerMail({ origin, requestId: r.id, number })],
      ['admin', admin, expiredAdminMail({ partnerName, number, lateCount30d: (late && late.n) || 1 })],
    ];
    for (const [who, to, mail] of jobs) {
      const res = await sendMail(env, { to, idempotencyKey: `expired-${who}-${r.id}`, ...mail });
      await audit(env, { actorType: 'system', action: res.ok ? `mail_expired_${who}_ok` : `mail_expired_${who}_fail:${res.error}`, objectType: 'request', objectId: r.id });
    }
  }
  return expired;
}

// Partneriams, kurių atsakymo terminas baigiasi per 2 val., išsiunčiamas vienas priminimas.
async function remind(env, origin, now) {
  const until = new Date(now.getTime() + WINDOW_HOURS * 3600e3);
  const { results = [] } = await env.DB.prepare(
    `SELECT id, partner_id, summary, price_eur, deadline_at FROM requests
      WHERE status = 'laukia_apmokejimo' AND reminder_sent_at IS NULL
        AND deadline_at > ? AND deadline_at <= ? LIMIT 50`
  ).bind(now.toISOString(), until.toISOString()).all();
  let sent = 0;
  for (const r of results) {
    // Pirmiausia pažymima, kad priminimas nebūtų siunčiamas du kartus net ir esant klaidai.
    const mark = await env.DB.prepare('UPDATE requests SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL')
      .bind(now.toISOString(), r.id).run();
    if (!mark.meta || !mark.meta.changes) continue;
    const res = await sendMail(env, {
      to: await partnerRecipients(env, r.partner_id), idempotencyKey: `reminder-${r.id}`,
      ...reminderMail({ origin, requestId: r.id, summary: parse(r.summary), priceEur: r.price_eur, deadlineAt: r.deadline_at }),
    });
    if (res.ok) sent++;
    await audit(env, { actorType: 'system', action: res.ok ? 'mail_reminder_ok' : `mail_reminder_fail:${res.error}`, objectType: 'request', objectId: r.id });
  }
  return { checked: results.length, sent };
}

// Saugojimo terminas: sutarties failas ištrinamas praėjus delete_after (90 d. po pasirašymo),
// kartu išvalomi pasibaigę prisijungimo kodai, sesijos ir atsisiuntimo žetonai.
async function cleanup(env, now) {
  const iso = now.toISOString();
  const { results = [] } = await env.DB.prepare(
    'SELECT id, file_key FROM contracts WHERE deleted_at IS NULL AND delete_after IS NOT NULL AND delete_after <= ? LIMIT 100'
  ).bind(iso).all();
  let deleted = 0;
  for (const c of results) {
    if (c.file_key) await env.CONTRACTS.delete(c.file_key);
    await env.DB.prepare('UPDATE contracts SET deleted_at = ?, wrapped_key = NULL, signing_ref = NULL WHERE id = ? AND deleted_at IS NULL')
      .bind(iso, c.id).run();
    await env.DB.prepare("DELETE FROM download_tokens WHERE contract_id = ?").bind(c.id).run();
    await audit(env, { actorType: 'system', action: 'contract_deleted_retention', objectType: 'contract', objectId: c.id });
    deleted++;
  }
  const dayAgo = new Date(now.getTime() - 864e5).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_codes WHERE expires_at < ?').bind(dayAgo),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(iso),
    env.DB.prepare('DELETE FROM download_tokens WHERE expires_at < ?').bind(dayAgo),
  ]);
  return deleted;
}

// POST /api/cron/reminders – kviečia suplanuota užduotis (cron/worker.js) kas valandą.
export async function onRequestPost({ request, env }) {
  const key = request.headers.get('X-Cron-Key') || '';
  if (!env.CRON_SECRET || !safeEqual(key, env.CRON_SECRET)) return json({ error: 'Draudžiama' }, 403);
  const now = new Date();
  const origin = new URL(request.url).origin;
  const expired = await expire(env, origin, now);
  const r = await remind(env, origin, now);
  const contractsDeleted = await cleanup(env, now);
  return json({ ok: true, expired, ...r, contractsDeleted });
}
