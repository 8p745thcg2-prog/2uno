import { lookupCompany, isValidCompanyCode, isValidVatCode } from '../_lib/company.js';
import { json } from '../_lib/http.js';

// GET /api/company?code=123456789[&vat=LT123456789]
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const code = (url.searchParams.get('code') || '').trim();
  const vat = (url.searchParams.get('vat') || '').replace(/\s/g, '');
  if (!isValidCompanyCode(code)) return json({ error: 'Įmonės kodą sudaro 9 skaitmenys' }, 400);
  if (vat && !isValidVatCode(vat)) return json({ error: 'Neteisingas PVM kodas' }, 400);
  const result = await lookupCompany(code, vat);
  return json(result);
}
