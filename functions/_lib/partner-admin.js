// Partnerio duomenų tikrinimas administravimo formoms.
import { randomId } from './crypto.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailList(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/);
  return [...new Set(arr.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
}

export function validatePartner(body) {
  const errors = {};
  const name = String(body.name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  const companyCode = String(body.companyCode || '').trim();
  const notifyEmails = emailList(body.notifyEmails);
  const userEmails = emailList(body.userEmails);
  if (!name) errors.name = 'Įrašykite pavadinimą';
  if (companyCode && !/^\d{9}$/.test(companyCode)) errors.companyCode = 'Įmonės kodas – 9 skaitmenys';
  if (notifyEmails.some((e) => !EMAIL.test(e))) errors.notifyEmails = 'Patikrinkite el. pašto adresus';
  if (userEmails.some((e) => !EMAIL.test(e))) errors.userEmails = 'Patikrinkite el. pašto adresus';
  if (notifyEmails.length > 10 || userEmails.length > 20) errors.userEmails = 'Per daug adresų';
  return { ok: !Object.keys(errors).length, errors, data: { name, companyCode, notifyEmails, userEmails, active: body.active ? 1 : 0 } };
}

// Sinchronizuoja partnerio naudotojus: prideda naujus, pašalina išbrauktus (ir jų sesijas).
export async function syncUsers(env, partnerId, emails) {
  const { results: current = [] } = await env.DB.prepare('SELECT id, email FROM partner_users WHERE partner_id = ?').bind(partnerId).all();
  for (const e of emails) {
    const other = await env.DB.prepare('SELECT partner_id FROM partner_users WHERE email = ?').bind(e).first();
    if (other && other.partner_id !== partnerId) return { error: `${e} jau priskirtas kitai įmonei` };
  }
  const stmts = [];
  for (const u of current) {
    if (!emails.includes(u.email)) {
      stmts.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND role = 'partner'").bind(u.id));
      stmts.push(env.DB.prepare('DELETE FROM partner_users WHERE id = ?').bind(u.id));
    }
  }
  for (const e of emails) {
    if (!current.some((u) => u.email === e)) {
      const id = randomId(12);
      stmts.push(env.DB.prepare('INSERT INTO partner_users (id, partner_id, email) VALUES (?, ?, ?)').bind(id, partnerId, e));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { ok: true };
}
