import { renderDemoContract, validateClient } from '../../_lib/contract-template.js';
import { encryptBytes, encryptField, sha256Hex, randomId, b64encode } from '../../_lib/crypto.js';
import { json, notFound, isProduction, readJson, sameOrigin, audit } from '../../_lib/http.js';

const DEMO_PRICE_EUR = 150;
const RETENTION_DAYS = 90;
const LINK_MINUTES = 15;

// POST /api/demo/contracts – sugeneruoja demonstracinę sutartį, ją užšifruoja ir išsaugo.
// Grąžina vienkartinę 15 min. atsisiuntimo nuorodą. Produkcinėje aplinkoje neveikia.
export async function onRequestPost({ request, env }) {
  if (isProduction(env)) return notFound();
  if (!sameOrigin(request)) return json({ error: 'Draudžiama' }, 403);

  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return json({ error: 'Netinkami duomenys' }, 400);
  }
  const { ok, errors, client } = validateClient(body);
  if (!ok) return json({ error: 'Patikrinkite laukus', fields: errors }, 422);
  if (client.vat && !/^LT/i.test(client.vat)) client.vat = 'LT' + client.vat;

  const now = new Date();
  const requestId = randomId();
  const contractId = randomId();
  const number = `2UNO-DEMO-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomId(3).toUpperCase()}`;

  const pdf = await renderDemoContract({ number, date: now, client, priceEur: DEMO_PRICE_EUR });
  const sha256 = await sha256Hex(pdf);
  const box = await encryptBytes(env, pdf, `contract:${contractId}`);
  const fileKey = `contracts/${contractId}.bin`;
  await env.CONTRACTS.put(fileKey, box.ciphertext, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { v: box.version },
  });

  const clientEnc = await encryptField(env, JSON.stringify(client), `request:${requestId}`);
  const token = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(new TextEncoder().encode(token));
  const deleteAfter = new Date(now.getTime() + RETENTION_DAYS * 864e5).toISOString();
  const expires = new Date(now.getTime() + LINK_MINUTES * 60e3).toISOString();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO requests (id, status, client_enc, summary, price_eur) VALUES (?, 'laukia_kliento_paraso', ?, ?, ?)"
    ).bind(requestId, clientEnc, JSON.stringify({ demo: true, number }), DEMO_PRICE_EUR),
    env.DB.prepare(
      "INSERT INTO contracts (id, request_id, file_key, wrapped_key, sha256, signing_provider, delete_after) VALUES (?, ?, ?, ?, ?, 'internal', ?)"
    ).bind(contractId, requestId, fileKey, box.wrappedKey, sha256, deleteAfter),
    env.DB.prepare('INSERT INTO download_tokens (token_hash, contract_id, expires_at) VALUES (?, ?, ?)').bind(tokenHash, contractId, expires),
  ]);
  await audit(env, { actorType: 'client', action: 'contract_generated', objectType: 'contract', objectId: contractId, request });

  return json({
    contractId,
    number,
    sha256,
    sizeBytes: pdf.length,
    downloadUrl: `/api/demo/contracts/${contractId}/download?t=${token}`,
    linkExpiresAt: expires,
    deleteAfter,
  }, 201);
}
