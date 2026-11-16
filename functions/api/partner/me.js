import { requirePartner } from '../../_lib/partner.js';
import { json } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const { session, error } = await requirePartner(request, env);
  if (error) return error;
  return json({ email: session.email, partnerName: session.partnerName });
}
