// Patikrina Signa Platform pasirašymo būseną ir, jei klientas pasirašė, užbaigia užklausą.
//
// TODO (blokuoja pilną veikimą): Signa Platform "callback" pranešime ateina tik įvykių sąrašas
// (pvz. lastEventCode: "sign"), bet NE pats pasirašytas failas. Kad užbaigtume sutartį, reikia
// atsisiųsti pasirašytą dokumentą – tam skirta Signa Platform operacija "download", kurios
// dokumentacijos dar neturime. Kai ją gausime, reikės parašyti fetchSignedPdf() realiai
// kviečiant tą operaciją (cid + docExtUid → pasirašyto PDF baitai).
import { finalizeClientSigned } from './request-flow.js';
import { audit } from './http.js';

async function fetchSignedPdf(env, docExtUid) {
  throw new Error('Signa Platform "download" operacija dar neintegruota – reikia MitSoft dokumentacijos.');
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
