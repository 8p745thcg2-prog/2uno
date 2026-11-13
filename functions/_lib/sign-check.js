// Patikrina Dokobit pasirašymo būseną ir, jei klientas pasirašė, užbaigia užklausą.
import { signingStatus, downloadSigned } from './dokobit.js';
import { finalizeClientSigned } from './request-flow.js';
import { audit } from './http.js';

export async function completeIfSigned(env, { contractId, requestId, signingToken, origin, waitUntil }) {
  const st = await signingStatus(env, signingToken);
  if (st.status !== 'completed' || !st.fileUrl) return { signed: false, status: st.status };
  const pdf = await downloadSigned(env, st.fileUrl);
  const r = await finalizeClientSigned(env, { requestId, contractId, pdf, origin, waitUntil, signedBy: 'provider' });
  if (!r.already) await audit(env, { actorType: 'provider', action: 'dokobit_signed', objectType: 'request', objectId: requestId });
  return { signed: true };
}
