import { safeEqual } from '../../_lib/crypto.js';
import { json, audit } from '../../_lib/http.js';
import { sendMail, reminderMail, partnerRecipients } from '../../_lib/mail.js';

const WINDOW_HOURS = 2;

// POST /api/cron/reminders – kviečia suplanuota užduotis (cron/worker.js) kas valandą.
// Partneriams, kurių atsakymo terminas baigiasi per 2 val., išsiunčiamas vienas priminimas.
export async function onRequestPost({ request, env }) {
  const key = request.headers.get('X-Cron-Key') || '';
  if (!env.CRON_SECRET || !safeEqual(key, env.CRON_SECRET)) return json({ error: 'Draudžiama' }, 403);

  const now = new Date();
  const until = new Date(now.getTime() + WINDOW_HOURS * 3600e3);
  const { results = [] } = await env.DB.prepare(
    `SELECT id, partner_id, summary, price_eur, deadline_at FROM requests
      WHERE status = 'laukia_apmokejimo' AND reminder_sent_at IS NULL
        AND deadline_at > ? AND deadline_at <= ? LIMIT 50`
  ).bind(now.toISOString(), until.toISOString()).all();

  const origin = new URL(request.url).origin;
  let sent = 0;
  for (const r of results) {
    // Pirmiausia pažymima, kad priminimas nebūtų siunčiamas du kartus net ir esant klaidai.
    const mark = await env.DB.prepare('UPDATE requests SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL')
      .bind(now.toISOString(), r.id).run();
    if (!mark.meta || !mark.meta.changes) continue;
    let summary = {};
    try { summary = JSON.parse(r.summary || '{}'); } catch { summary = {}; }
    const to = await partnerRecipients(env, r.partner_id);
    const res = await sendMail(env, {
      to, idempotencyKey: `reminder-${r.id}`,
      ...reminderMail({ origin, requestId: r.id, summary, priceEur: r.price_eur, deadlineAt: r.deadline_at }),
    });
    if (res.ok) sent++;
    await audit(env, { actorType: 'system', action: res.ok ? 'mail_reminder_ok' : `mail_reminder_fail:${res.error}`, objectType: 'request', objectId: r.id });
  }
  return json({ ok: true, checked: results.length, sent });
}
