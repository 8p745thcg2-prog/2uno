// Bendri užklausos žingsniai: pasirašytos sutarties išsaugojimas ir pranešimas buhalterinei įmonei.
import { encryptBytes, sha256Hex, b64encode } from './crypto.js';
import { audit } from './http.js';
import { responseDeadline } from './deadline.js';
import { sendMail, newRequestMail, partnerRecipients } from './mail.js';

// Kliento pasirašytą PDF užšifruoja ir išsaugo, užklausą perjungia į „laukia apmokėjimo“, praneša įmonei.
// Kartojamas kvietimas nieko nekeičia (svarbu, kai Dokobit praneša kelis kartus).
export async function finalizeClientSigned(env, { requestId, contractId, pdf, origin, waitUntil, signedBy = 'client' }) {
  const now = new Date();
  const deadline = responseDeadline(now); // partnerystės sutarties 6.1 p.
  const box = await encryptBytes(env, pdf, `contract:${contractId}`);
  const fileKey = `contracts/${contractId}.bin`;
  const sha256 = await sha256Hex(pdf);

  // Pirmiausia „užimame“ perėjimą, kad lygiagretus kvietimas jo nepakartotų.
  const claim = await env.DB.prepare(
    "UPDATE requests SET status = 'laukia_apmokejimo', deadline_at = ?, updated_at = ? WHERE id = ? AND status IN ('juodrastis','laukia_kliento_paraso')"
  ).bind(deadline, now.toISOString(), requestId).run();
  if (!claim.meta || !claim.meta.changes) return { already: true };

  await env.CONTRACTS.put(fileKey, box.ciphertext, { customMetadata: { v: box.version } });
  await env.DB.prepare(
    'UPDATE contracts SET file_key = ?, wrapped_key = ?, sha256 = ?, client_signed_at = ?, delete_after = ? WHERE id = ?'
  ).bind(fileKey, box.wrappedKey, sha256, now.toISOString(), new Date(now.getTime() + 90 * 864e5).toISOString(), contractId).run();
  await audit(env, { actorType: signedBy === 'provider' ? 'provider' : 'client', action: 'contract_signed', objectType: 'request', objectId: requestId });

  const r = await env.DB.prepare('SELECT partner_id, summary, price_eur FROM requests WHERE id = ?').bind(requestId).first();
  const summary = JSON.parse((r && r.summary) || '{}');
  const notify = (async () => {
    const sent = await sendMail(env, {
      to: await partnerRecipients(env, r.partner_id), idempotencyKey: `new-request-${requestId}`,
      ...newRequestMail({ origin, requestId, summary, priceEur: r.price_eur, deadlineAt: deadline }),
    });
    await audit(env, { actorType: 'system', action: sent.ok ? 'mail_new_request_ok' : `mail_new_request_fail:${sent.error}`, objectType: 'request', objectId: requestId });
  })().catch((e) => console.error('Pranešimo klaida', e && e.message));
  if (typeof waitUntil === 'function') waitUntil(notify); else await notify;
  return { sha256, deadline };
}

// Vienkartinė 15 min. nuoroda kliento sutarties kopijai.
export async function clientDownloadToken(env, contractId) {
  const token = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO download_tokens (token_hash, contract_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(new TextEncoder().encode(token)), contractId, new Date(Date.now() + 15 * 60e3).toISOString()).run();
  return `/api/demo/contracts/${contractId}/download?t=${token}`;
}
