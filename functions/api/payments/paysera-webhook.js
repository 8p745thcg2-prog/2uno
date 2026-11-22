import { json, audit } from '../../_lib/http.js';
import { getOrder, verifyWebhookSignature } from '../../_lib/paysera.js';
import { sendMail, partnerRecipients, paymentPaidMail } from '../../_lib/mail.js';

// POST /api/payments/paysera-webhook – Paysera callback_url.
// Saugumas: webhook'as tik SAKO, kad kažkas įvyko; tikras patvirtinimas – GET užsakymo būsena su mūsų
// OAuth raktu (žemiau), tad net ir be galutinai patikrintos parašo schemos, pinigų įskaitymas lieka saugus.
function extractOrderId(body) {
  const order = body && body.order;
  if (!order) return null;
  // Realus Paysera webhook turinys naudoja 'paysera_order_id' (patikrinta tikru webhook'u 2026-11-22),
  // ne 'order_id'/'id', kaip klaidingai nurodyta dokumentacijoje ir Orders API atsakyme.
  return order.paysera_order_id || order.order_id || order.id || null;
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad body' }, 400); }

  const orderId = extractOrderId(body);

  // LAIKINA diagnostika: patvirtina, kad Paysera apskritai pasiekė šį endpoint'ą.
  await audit(env, { actorType: 'system', action: `webhook_hit:${raw.slice(0, 100)}`, objectType: 'order', objectId: orderId, request }).catch(() => {});

  const sig = request.headers.get('X-Paysera-Signature');
  if (sig) {
    const ok = await verifyWebhookSignature(env, raw, sig).catch(() => false);
    if (!ok) await audit(env, { actorType: 'system', action: 'webhook_bad_signature', objectType: 'order', objectId: orderId, request });
  }

  if (!orderId) return json({ ok: true });

  const pay = await env.DB.prepare(
    'SELECT id, request_id, amount_cents, status FROM payments WHERE provider_order_id = ? AND provider = ?'
  ).bind(orderId, 'paysera').first();
  if (!pay) {
    await audit(env, { actorType: 'system', action: 'webhook_no_payment_row', objectType: 'order', objectId: orderId, request }).catch(() => {});
    return json({ ok: true }); // nežinomas užsakymas
  }
  if (pay.status === 'apmoketa') return json({ ok: true }); // idempotentiškumas (pakartotiniai webhook'ai)

  let order;
  try {
    order = await getOrder(env, orderId);
  } catch (e) {
    console.error('Paysera getOrder klaida', e && e.message);
    await audit(env, { actorType: 'system', action: `webhook_getorder_fail:${String(e && e.message).slice(0, 80)}`, objectType: 'order', objectId: orderId, request }).catch(() => {});
    return json({ ok: false }, 502);
  }

  // Paysera API laukų pavadinimai yra snake_case (patikrinta tikru atsakymu, ne dokumentacija).
  const amountPaid = Number(order.amount_paid ?? order.amountPaid ?? 0);

  // LAIKINA diagnostika: ką tiksliai grąžino getOrder.
  await audit(env, { actorType: 'system', action: `webhook_order_state:status=${order.status},paid=${amountPaid},need=${pay.amount_cents}`, objectType: 'order', objectId: orderId, request }).catch(() => {});

  if (order.status === 'paid' && amountPaid >= pay.amount_cents) {
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE payments SET status = 'apmoketa', paid_at = ? WHERE id = ?").bind(now, pay.id).run();
    const claim = await env.DB.prepare(
      "UPDATE requests SET status = 'apmoketa', updated_at = ? WHERE id = ? AND status = 'laukia_apmokejimo'"
    ).bind(now, pay.request_id).run();
    await audit(env, { actorType: 'system', action: 'payment_paid', objectType: 'request', objectId: pay.request_id });

    if (claim.meta && claim.meta.changes) {
      const r = await env.DB.prepare('SELECT partner_id, summary FROM requests WHERE id = ?').bind(pay.request_id).first();
      const summary = JSON.parse((r && r.summary) || '{}');
      const origin = new URL(request.url).origin;
      const sent = await sendMail(env, {
        to: await partnerRecipients(env, r.partner_id),
        idempotencyKey: `payment-paid-${pay.request_id}`,
        ...paymentPaidMail({ origin, requestId: pay.request_id, summary }),
      });
      await audit(env, { actorType: 'system', action: sent.ok ? 'mail_payment_paid_ok' : `mail_payment_paid_fail:${sent.error}`, objectType: 'request', objectId: pay.request_id });
    }
  } else if (order.status === 'canceled' || order.status === 'closed') {
    await env.DB.prepare("UPDATE payments SET status = 'nepavyko' WHERE id = ?").bind(pay.id).run();
    await audit(env, { actorType: 'system', action: `payment_failed:${order.status}`, objectType: 'request', objectId: pay.request_id });
  }
  // order.status === 'pending_payment' – laukiame, nieko nedarome.

  return json({ ok: true });
}
