import { getPartnerSession } from './auth.js';
import { json, sameOrigin } from './http.js';
import { decryptField } from './crypto.js';

export const UNLOCKED = ['apmoketa', 'pasirasyta'];

export const STATUS_LABELS = {
  laukia_kliento_paraso: 'Laukia kliento parašo',
  laukia_apmokejimo: 'Klientas pasirašė – laukia apmokėjimo',
  apmoketa: 'Apmokėta – sutartis atrakinta',
  pasirasyta: 'Pasirašyta abiejų šalių',
  grazinta: 'Komisinis grąžintas',
  partneris_atsisake: 'Atsisakyta',
  pasibaige_terminas: 'Pasibaigė terminas',
  atsaukta: 'Atšaukta',
  uzdaryta: 'Uždaryta',
  juodrastis: 'Juodraštis',
};

const DEFAULT_COMMISSION_EUR = 200;

// Grąžina sesiją arba atsakymą su klaida (401/403).
export async function requirePartner(request, env, { write = false } = {}) {
  if (write && !sameOrigin(request)) return { error: json({ error: 'Draudžiama' }, 403) };
  const s = await getPartnerSession(request, env);
  if (!s) return { error: json({ error: 'Reikia prisijungti' }, 401) };
  return { session: s };
}

// Komisinio dydis pagal sutartį su konkrečiu partneriu (partners.pricing JSON: { commissionEur }).
// Kol nenurodyta kitaip – 200 €, be PVM.
export async function commissionEurForPartner(env, partnerId) {
  const p = await env.DB.prepare('SELECT pricing FROM partners WHERE id = ?').bind(partnerId).first();
  let pricing = {};
  try { pricing = JSON.parse((p && p.pricing) || '{}'); } catch { pricing = {}; }
  const v = Number(pricing.commissionEur);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_COMMISSION_EUR;
}

// Užklausa, priklausanti BŪTENT šiam partneriui ir jau pasirašyta kliento (kitaip – null).
export async function loadRequest(env, id, partnerId) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(String(id || ''))) return null;
  return env.DB.prepare(
    `SELECT r.id, r.status, r.summary, r.price_eur, r.deadline_at, r.created_at, r.client_enc, r.partner_id,
            c.id AS contract_id, c.deleted_at AS contract_deleted
       FROM requests r LEFT JOIN contracts c ON c.request_id = r.id
      WHERE r.id = ? AND r.partner_id = ? AND c.client_signed_at IS NOT NULL
        AND r.status NOT IN ('juodrastis','laukia_kliento_paraso')`
  ).bind(id, partnerId).first();
}

// Iki apmokėjimo – tik santrauka; po apmokėjimo – ir kliento duomenys.
export async function presentRequest(env, r) {
  const unlocked = UNLOCKED.includes(r.status);
  const out = {
    id: r.id,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] || r.status,
    unlocked,
    summary: JSON.parse(r.summary || '{}'),
    priceEur: r.price_eur,
    deadlineAt: r.deadline_at,
    createdAt: r.created_at,
    hasContract: !!r.contract_id && !r.contract_deleted,
  };
  if (unlocked && r.client_enc) out.client = JSON.parse(await decryptField(env, r.client_enc, `request:${r.id}`));
  if (!unlocked && r.status === 'laukia_apmokejimo') out.commissionEur = await commissionEurForPartner(env, r.partner_id);
  return out;
}
