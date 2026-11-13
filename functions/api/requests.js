import { renderDemoContract, validateClient } from '../_lib/contract-template.js';
import { encryptBytes, encryptField, sha256Hex, randomId, b64encode } from '../_lib/crypto.js';
import { json, notFound, isProduction, readJson, sameOrigin, audit } from '../_lib/http.js';
import { sendMail, newRequestMail, partnerRecipients } from '../_lib/mail.js';
import { responseDeadline } from '../_lib/deadline.js';
import { verifyTurnstile, TURNSTILE_ERROR } from '../_lib/turnstile.js';

// Kol tikrų partnerių nėra, testinėje aplinkoje visos užklausos keliauja demo partneriui.
const DEMO_PARTNER_ID = 'demo-partner-0001';

function clean(v, max = 120) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}


// POST /api/requests – klientas pasirašo sutartį su pasirinktu partneriu.
// Sukuriama užklausa (laukia apmokėjimo), sutartis sugeneruojama, užšifruojama ir išsaugoma.
export async function onRequestPost({ request, env, waitUntil }) {
  if (isProduction(env)) return notFound(); // produkcijoje įjungsime kartu su tikru parašu
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body;
  try { body = await readJson(request, 16 * 1024); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  if (!(await verifyTurnstile(env, body.turnstile, request))) return json({ error: TURNSTILE_ERROR }, 403);

  const { ok, errors, client } = validateClient(body.client || {});
  const fullName = clean(body.signature && body.signature.fullName);
  if (!body.signature || body.signature.consent !== true) errors.consent = 'Patvirtinkite, kad susipažinote su sutartimi';
  if (fullName.toLowerCase() !== client.representative.toLowerCase()) errors.fullName = 'Vardas ir pavardė turi sutapti su atstovo duomenimis';
  if (!ok || Object.keys(errors).length) return json({ error: 'Patikrinkite laukus', fields: errors }, 422);
  if (client.vat && !/^LT/i.test(client.vat)) client.vat = 'LT' + client.vat;

  const price = Math.round(Number(body.priceEur) * 100) / 100; // TODO: kaina bus skaičiuojama serveryje pagal partnerio kainodarą
  if (!(price > 0 && price < 100000)) return json({ error: 'Neteisinga kaina' }, 400);
  const s = body.summary || {};
  const summary = {
    legalForm: clean(s.legalForm, 20), employees: clean(s.employees, 20), invoices: clean(s.invoices, 40),
    situation: clean(s.situation, 80), vat: clean(s.vat, 20), industry: clean(s.industry, 60), startDate: clean(s.startDate, 20),
    providerName: clean(body.providerName, 80),
  };

  await env.DB.prepare(
    "INSERT OR IGNORE INTO partners (id, name, company_code, notify_emails, active) VALUES (?, 'UAB „Demo apskaita“', '300000000', '[]', 1)"
  ).bind(DEMO_PARTNER_ID).run();

  const now = new Date();
  const deadline = responseDeadline(now); // partnerystės sutarties 6.1 p.
  const requestId = randomId();
  const contractId = randomId();
  const number = `2UNO-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomId(3).toUpperCase()}`;
  summary.number = number;

  const pdf = await renderDemoContract({ number, date: now, client, priceEur: price });
  const sha256 = await sha256Hex(pdf);
  const box = await encryptBytes(env, pdf, `contract:${contractId}`);
  const fileKey = `contracts/${contractId}.bin`;
  await env.CONTRACTS.put(fileKey, box.ciphertext, { customMetadata: { v: box.version } });

  const token = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO requests (id, status, partner_id, client_enc, summary, price_eur, deadline_at) VALUES (?, 'laukia_apmokejimo', ?, ?, ?, ?, ?)"
    ).bind(requestId, DEMO_PARTNER_ID, await encryptField(env, JSON.stringify(client), `request:${requestId}`),
      JSON.stringify(summary), price, deadline),
    env.DB.prepare(
      "INSERT INTO contracts (id, request_id, file_key, wrapped_key, sha256, signing_provider, signing_ref, client_signed_at, delete_after) VALUES (?, ?, ?, ?, ?, 'internal', ?, ?, ?)"
    ).bind(contractId, requestId, fileKey, box.wrappedKey, sha256,
      await encryptField(env, JSON.stringify({ fullName, at: now.toISOString(), ip: request.headers.get('CF-Connecting-IP') }), `sign:${contractId}`),
      now.toISOString(), new Date(now.getTime() + 90 * 864e5).toISOString()),
    env.DB.prepare('INSERT INTO download_tokens (token_hash, contract_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256Hex(new TextEncoder().encode(token)), contractId, new Date(now.getTime() + 15 * 60e3).toISOString()),
  ]);
  await audit(env, { actorType: 'client', action: 'contract_signed_internal', objectType: 'request', objectId: requestId, request });

  // Pranešimas partneriui siunčiamas fone, kad klientui nereikėtų laukti.
  const notify = (async () => {
    const to = await partnerRecipients(env, DEMO_PARTNER_ID);
    const sent = await sendMail(env, {
      to, idempotencyKey: `new-request-${requestId}`,
      ...newRequestMail({ origin: new URL(request.url).origin, requestId, summary, priceEur: price, deadlineAt: deadline }),
    });
    await audit(env, { actorType: 'system', action: sent.ok ? 'mail_new_request_ok' : `mail_new_request_fail:${sent.error}`, objectType: 'request', objectId: requestId });
  })().catch((e) => console.error('Pranešimo klaida', e && e.message));
  if (typeof waitUntil === 'function') waitUntil(notify); else await notify;

  return json({ ok: true, number, sha256, downloadUrl: `/api/demo/contracts/${contractId}/download?t=${token}` }, 201);
}
