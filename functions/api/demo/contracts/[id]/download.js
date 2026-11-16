import { decryptBytes, sha256Hex } from '../../../../_lib/crypto.js';
import { json, notFound, isProduction, audit } from '../../../../_lib/http.js';

// GET /api/demo/contracts/:id/download?t=<vienkartinis žetonas>
// Žetonas galioja 15 min. ir tik vieną kartą. Failas iššifruojamas tik siuntimo metu.
export async function onRequestGet({ request, env, params }) {
  if (isProduction(env)) return notFound();
  const id = String(params.id || '');
  const token = new URL(request.url).searchParams.get('t') || '';
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(id) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return notFound();

  const tokenHash = await sha256Hex(new TextEncoder().encode(token));
  const now = new Date().toISOString();
  const used = await env.DB.prepare(
    'UPDATE download_tokens SET used_at = ? WHERE token_hash = ? AND contract_id = ? AND used_at IS NULL AND expires_at > ? RETURNING contract_id'
  ).bind(now, tokenHash, id, now).first();
  if (!used) return json({ error: 'Nuoroda nebegalioja. Sugeneruokite naują.' }, 410);

  const contract = await env.DB.prepare(
    'SELECT file_key, wrapped_key, sha256, deleted_at FROM contracts WHERE id = ?'
  ).bind(id).first();
  if (!contract || contract.deleted_at) return notFound();

  const obj = await env.CONTRACTS.get(contract.file_key);
  if (!obj) return notFound();
  const ciphertext = new Uint8Array(await obj.arrayBuffer());
  const pdf = await decryptBytes(env, { wrappedKey: contract.wrapped_key, ciphertext }, `contract:${id}`);
  if ((await sha256Hex(pdf)) !== contract.sha256) return json({ error: 'Failo vientisumo klaida' }, 500);

  await audit(env, { actorType: 'client', action: 'contract_downloaded', objectType: 'contract', objectId: id, request });
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="2uno-sutartis-demo.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
