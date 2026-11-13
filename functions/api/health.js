import { encryptBytes, decryptBytes, encryptField, decryptField } from '../_lib/crypto.js';

// Techninė patikra: ar prijungta duomenų bazė, saugykla ir ar veikia šifravimas.
// Grąžina tik „ok“ / klaidos tipą, jokių duomenų ar raktų.
export async function onRequestGet({ env }) {
  // Produkcijoje vidinė informacija neatskleidžiama.
  if (env.APP_ENV !== 'test') {
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const result = { env: env.APP_ENV || 'nenustatyta', d1: 'nėra', r2: 'nėra', crypto: 'nėra' };

  if (env.DB) {
    try {
      await env.DB.prepare('SELECT 1').first();
      const t = await env.DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").first();
      result.d1 = `ok (${t.n} lentelės)`;
    } catch (e) {
      result.d1 = 'klaida';
    }
  }

  if (env.CONTRACTS) {
    try {
      await env.CONTRACTS.list({ limit: 1 });
      result.r2 = 'ok';
    } catch (e) {
      result.r2 = 'klaida';
    }
  }

  if (env.MASTER_KEY) {
    try {
      const sample = new TextEncoder().encode('2uno šifravimo testas');
      const box = await encryptBytes(env, sample, 'health');
      const back = await decryptBytes(env, box, 'health');
      const field = await decryptField(env, await encryptField(env, 'laukas', 'f'), 'f');
      let tamperBlocked = false;
      try {
        await decryptBytes(env, box, 'kitas-kontekstas');
      } catch {
        tamperBlocked = true;
      }
      const ok = new TextDecoder().decode(back) === '2uno šifravimo testas' && field === 'laukas' && tamperBlocked;
      result.crypto = ok ? 'ok' : 'klaida';
    } catch (e) {
      result.crypto = 'klaida';
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
