// Patikrina Signa Platform pasirašymo būseną ir, jei klientas pasirašė, užbaigia užklausą.
//
// SVARBU: šią funkciją saugu kviesti TIK gavus patikimą signalą, kad pasirašymas jau įvyko
// (t. y. iš Signa Platform callback'o – žr. api/sign/signa.js), o ne kiekvieną kartą, kai klientas
// atnaujina pasirašymo puslapį. Operacija "download" grąžina dokumentą nepriklausomai nuo to, ar jis
// jau pasirašytas, todėl kviečiant ją be tokio signalo būtų rizika užbaigti sutartį su nepasirašytu failu.
import { downloadDocument } from './signa.js';
import { finalizeClientSigned } from './request-flow.js';
import { audit } from './http.js';

async function fetchSignedPdf(env, docExtUid) {
  const bytes = await downloadDocument(env, docExtUid);
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    throw new Error('Signa: gautas ne PDF');
  }
  return bytes;
}

export async function completeIfSignedSigna(env, { contractId, requestId, docExtUid, origin, waitUntil }) {
  let pdf;
  try {
    pdf = await fetchSignedPdf(env, docExtUid);
  } catch (e) {
    console.error('Signa: nepavyko gauti pasirašyto dokumento', e && e.message);
    return { signed: false, pending: true };
  }
  const r = await finalizeClientSigned(env, { requestId, contractId, pdf, origin, waitUntil, signedBy: 'client' });
  if (!r.already) await audit(env, { actorType: 'client', action: 'signa_signed', objectType: 'request', objectId: requestId });
  return { signed: true };
}
