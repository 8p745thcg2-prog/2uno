import { renderDemoContract } from '../../_lib/contract-template.js';
import { encryptBytes, encryptField, sha256Hex, randomId } from '../../_lib/crypto.js';
import { normEmail } from '../../_lib/auth.js';
import { json, notFound, isProduction, readJson, sameOrigin, audit } from '../../_lib/http.js';

const DEMO_PARTNER_ID = 'demo-partner-0001';
const CLIENTS = [
  { name: 'UAB „Bandomoji prekyba“', code: '300000001', address: 'Testo g. 1, LT-01100 Vilnius', representative: 'Jonas Bandomasis', position: 'direktorius', basis: 'įstatus', email: 'jonas@bandomoji.lt', phone: '+370 600 00001', bank: '', vat: '' ,
    summary: { legalForm: 'UAB', employees: '1–5', invoices: 'iki 30 per mėn.', situation: 'Keičia buhalterį' } },
  { name: 'MB „Pavyzdžio paslaugos“', code: '300000002', address: 'Pavyzdžio g. 5, LT-44200 Kaunas', representative: 'Ona Pavyzdytė', position: 'vadovė', basis: 'įstatus', email: 'ona@pavyzdys.lt', phone: '', bank: '', vat: '',
    summary: { legalForm: 'MB', employees: '0', invoices: 'iki 10 per mėn.', situation: 'Nauja įmonė' } },
  { name: 'UAB „Demo gamyba“', code: '300000003', address: 'Gamyklos g. 9, LT-76200 Šiauliai', representative: 'Petras Demonstratorius', position: 'generalinis direktorius', basis: 'įstatus', email: 'petras@demo.lt', phone: '', bank: '', vat: 'LT100000000003',
    summary: { legalForm: 'UAB', employees: '6–20', invoices: '30–100 per mėn.', situation: 'Apskaita sutvarkyta' } },
];

// POST /api/demo/seed { email } – TIK TESTINĖJE APLINKOJE: sukuria demo partnerį (jei nėra)
// ir vieną naują demo užklausą su užšifruota sutartimi, laukiančią apmokėjimo.
export async function onRequestPost({ request, env }) {
  if (isProduction(env)) return notFound();
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);
  let body = {};
  try { body = await readJson(request, 2048); } catch { /* tuščias */ }
  const email = normEmail(body.email || 'demo@2uno.lt');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Neteisingas el. paštas' }, 400);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO partners (id, name, company_code, notify_emails, active) VALUES (?, 'UAB „Demo apskaita“', '300000000', ?, 1)"
  ).bind(DEMO_PARTNER_ID, JSON.stringify([email])).run();
  await env.DB.prepare('INSERT OR IGNORE INTO partner_users (id, partner_id, email) VALUES (?, ?, ?)').bind(randomId(), DEMO_PARTNER_ID, email).run();
  const owner = await env.DB.prepare('SELECT partner_id FROM partner_users WHERE email = ?').bind(email).first();
  if (!owner || owner.partner_id !== DEMO_PARTNER_ID) return json({ error: 'Šis el. paštas priskirtas kitam partneriui' }, 409);

  const count = await env.DB.prepare('SELECT count(*) AS n FROM requests WHERE partner_id = ?').bind(DEMO_PARTNER_ID).first();
  const c = CLIENTS[(count.n || 0) % CLIENTS.length];
  const { summary, ...client } = c;
  const now = new Date();
  const requestId = randomId();
  const contractId = randomId();
  const number = `2UNO-DEMO-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomId(3).toUpperCase()}`;
  const pdf = await renderDemoContract({ number, date: now, client, priceEur: 150 });
  const box = await encryptBytes(env, pdf, `contract:${contractId}`);
  const fileKey = `contracts/${contractId}.bin`;
  await env.CONTRACTS.put(fileKey, box.ciphertext, { customMetadata: { v: box.version } });

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO requests (id, status, partner_id, client_enc, summary, price_eur, deadline_at) VALUES (?, 'laukia_apmokejimo', ?, ?, ?, 150, ?)"
    ).bind(requestId, DEMO_PARTNER_ID, await encryptField(env, JSON.stringify(client), `request:${requestId}`),
      JSON.stringify({ ...summary, number }), new Date(now.getTime() + 24 * 3600e3).toISOString()),
    env.DB.prepare(
      "INSERT INTO contracts (id, request_id, file_key, wrapped_key, sha256, signing_provider, client_signed_at, delete_after) VALUES (?, ?, ?, ?, ?, 'internal', ?, ?)"
    ).bind(contractId, requestId, fileKey, box.wrappedKey, await sha256Hex(pdf), now.toISOString(), new Date(now.getTime() + 90 * 864e5).toISOString()),
  ]);
  await audit(env, { actorType: 'system', action: 'demo_request_created', objectType: 'request', objectId: requestId, request });
  return json({ ok: true, email, requestId }, 201);
}
