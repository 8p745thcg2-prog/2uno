import { renderDemoContract, validateClient } from '../_lib/contract-template.js';
import { encryptField, sha256Hex, randomId, b64encode } from '../_lib/crypto.js';
import { json, notFound, isProduction, readJson, sameOrigin, audit } from '../_lib/http.js';
import { verifyTurnstile, TURNSTILE_ERROR } from '../_lib/turnstile.js';
import { finalizeClientSigned, clientDownloadToken } from '../_lib/request-flow.js';
import { dokobitEnabled, createSigning, splitName } from '../_lib/dokobit.js';

// Kol tikrų partnerių nėra, testinėje aplinkoje visos užklausos keliauja demo partneriui.
const DEMO_PARTNER_ID = 'demo-partner-0001';

function clean(v, max = 120) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

// POST /api/requests – klientas pasirašo sutartį su pasirinktu partneriu.
// Be Dokobit: pasirašoma iš karto (testinis parašas). Su Dokobit: grąžinama pasirašymo nuoroda,
// o užklausa partneriui perduodama tik gavus kvalifikuotą parašą (žr. /api/sign/*).
export async function onRequestPost({ request, env, waitUntil }) {
  if (isProduction(env)) return notFound(); // produkcijoje įjungsime kartu su tikru parašu
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body;
  try { body = await readJson(request, 16 * 1024); } catch { return json({ error: 'Netinkami duomenys' }, 400); }
  if (!(await verifyTurnstile(env, body.turnstile, request))) return json({ error: TURNSTILE_ERROR }, 403);

  const useDokobit = dokobitEnabled(env);
  const { ok, errors, client } = validateClient(body.client || {});
  const fullName = clean(body.signature && body.signature.fullName);
  if (!body.signature || body.signature.consent !== true) errors.consent = 'Patvirtinkite, kad susipažinote su sutartimi';
  if (!useDokobit && fullName.toLowerCase() !== client.representative.toLowerCase()) errors.fullName = 'Vardas ir pavardė turi sutapti su atstovo duomenimis';
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
  const requestId = randomId();
  const contractId = randomId();
  const number = `2UNO-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomId(3).toUpperCase()}`;
  summary.number = number;
  const pdf = await renderDemoContract({ number, date: now, client, priceEur: price });
  const origin = new URL(request.url).origin;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO requests (id, status, partner_id, client_enc, summary, price_eur) VALUES (?, 'laukia_kliento_paraso', ?, ?, ?, ?)"
    ).bind(requestId, DEMO_PARTNER_ID, await encryptField(env, JSON.stringify(client), `request:${requestId}`), JSON.stringify(summary), price),
    env.DB.prepare("INSERT INTO contracts (id, request_id, signing_provider) VALUES (?, ?, ?)")
      .bind(contractId, requestId, useDokobit ? 'dokobit' : 'internal'),
  ]);

  if (!useDokobit) {
    await env.DB.prepare('UPDATE contracts SET signing_ref = ? WHERE id = ?').bind(
      await encryptField(env, JSON.stringify({ fullName, at: now.toISOString(), ip: request.headers.get('CF-Connecting-IP') }), `sign:${contractId}`), contractId,
    ).run();
    const fin = await finalizeClientSigned(env, { requestId, contractId, pdf, origin, waitUntil });
    await audit(env, { actorType: 'client', action: 'contract_signed_internal', objectType: 'request', objectId: requestId, request });
    return json({ ok: true, number, sha256: fin.sha256, downloadUrl: await clientDownloadToken(env, contractId) }, 201);
  }

  // Kvalifikuotas parašas per Dokobit
  let signing;
  try {
    signing = await createSigning(env, {
      pdf, fileName: `${number}.pdf`, title: `Buhalterinių paslaugų sutartis ${number}`,
      signer: { id: requestId, ...splitName(client.representative) }, postbackUrl: `${origin}/api/sign/dokobit`,
    });
  } catch (e) {
    console.error('Dokobit klaida', e && e.message);
    await env.DB.prepare("UPDATE requests SET status = 'atsaukta' WHERE id = ?").bind(requestId).run();
    return json({ error: 'Pasirašymo paslauga šiuo metu nepasiekiama. Bandykite po kelių minučių.' }, 502);
  }
  const statusToken = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  const enc = new TextEncoder();
  await env.DB.prepare('UPDATE contracts SET signing_ref = ?, signing_lookup = ?, client_status_hash = ? WHERE id = ?').bind(
    await encryptField(env, signing.signingToken, `sign:${contractId}`),
    await sha256Hex(enc.encode('dokobit:' + signing.signingToken)),
    await sha256Hex(enc.encode(statusToken)), contractId,
  ).run();
  await audit(env, { actorType: 'client', action: 'signing_started_dokobit', objectType: 'request', objectId: requestId, request });
  return json({ ok: true, number, signUrl: signing.signerUrl, statusToken }, 201);
}
