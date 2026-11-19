import { requirePartner, loadRequest, commissionEurForPartner } from '../../../../_lib/partner.js';
import { json, notFound, audit } from '../../../../_lib/http.js';
import { randomId } from '../../../../_lib/crypto.js';
import { createOrder, createPaymentLink } from '../../../../_lib/paysera.js';

// POST /api/partner/requests/:id/pay – sukuria tikrą Paysera mokėjimo nuorodą komisiniui.
// Būseną į „apmoketa“ pakeičia TIK pasirašytas Paysera webhook (žr. functions/api/payments/paysera-webhook.js).
export async function onRequestPost({ request, env, params }) {
  const { session, error } = await requirePartner(request, env, { write: true });
  if (error) return error;

  const r = await loadRequest(env, params.id, session.partnerId);
  if (!r) return notFound();
  if (r.status !== 'laukia_apmokejimo') {
    const already = r.status === 'apmoketa' || r.status === 'pasirasyta';
    return json({ error: already ? 'Komisinis jau apmokėtas' : 'Šiuo metu apmokėti negalima' }, 409);
  }
  if (r.deadline_at && r.deadline_at < new Date().toISOString()) {
    await env.DB.prepare("UPDATE requests SET status = 'pasibaige_terminas', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), r.id).run();
    return json({ error: 'Terminas pasibaigė' }, 409);
  }

  const commissionEur = await commissionEurForPartner(env, session.partnerId);
  const amountCents = Math.round(commissionEur * 100);
  const summary = JSON.parse(r.summary || '{}');
  const origin = new URL(request.url).origin;
  const reference = `2uno-${r.id}-${Date.now().toString(36)}`;

  let order, link;
  try {
    order = await createOrder(env, {
      reference,
      amountCents,
      currency: 'EUR',
      successUrl: `${origin}/partneris?u=${encodeURIComponent(r.id)}&pay=ok`,
      failureUrl: `${origin}/partneris?u=${encodeURIComponent(r.id)}&pay=fail`,
      callbackUrl: `${origin}/api/payments/paysera-webhook`,
    });
    link = await createPaymentLink(env, {
      orderId: order.id,
      amountCents,
      name: `2uno komisinis – užklausa Nr. ${summary.number || r.id}`.slice(0, 255),
      language: 'lt',
    });
  } catch (e) {
    console.error('Paysera klaida', e && e.message);
    return json({ error: 'Nepavyko sukurti mokėjimo. Pabandykite vėliau arba rašykite info@2uno.lt.' }, 502);
  }

  const paymentUrl = link.payment_URL || link.paymentUrl || link.url;
  await env.DB.prepare(
    `INSERT INTO payments (id, request_id, provider, provider_order_id, provider_payment_id, amount_cents, currency, status)
     VALUES (?, ?, 'paysera', ?, ?, ?, 'EUR', 'pradeta')`
  ).bind(randomId(), r.id, order.id, link.id || link.link_id || null, amountCents).run();
  await audit(env, { actorType: 'partner', actorId: session.userId, action: 'payment_started', objectType: 'request', objectId: r.id, request });

  return json({ paymentUrl, commissionEur });
}
