// El. laiškų siuntimas per Resend (ES regionas). Raktas – Cloudflare paslaptis RESEND_API_KEY.
// Laiškuose niekada nesiunčiami kliento duomenys: tik užklausos santrauka ir nuoroda į portalą.

const ENDPOINT = 'https://api.resend.com/emails';
const FROM = '2uno.lt <pranesimai@2uno.lt>';
const REPLY_TO = 'info@2uno.lt';
const TIMEOUT_MS = 8000;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Paprastas, visuose pašto klientuose tvarkingai atrodantis laiško šablonas.
export function layout({ title, lines = [], button = null, footer = '' }) {
  const body = lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join('');
  const btn = button
    ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${esc(button.label)}</a></p>`
    : '';
  const html = `<!doctype html><html lang="lt"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="font-weight:700;font-size:18px;margin-bottom:16px">2uno.lt</div>
<div style="background:#fff;border-radius:12px;padding:24px;line-height:1.5;font-size:15px">
<h1 style="font-size:18px;margin:0 0 16px">${esc(title)}</h1>${body}${btn}</div>
<p style="font-size:12px;color:#78716c;margin:16px 4px">${esc(footer || 'Šis laiškas išsiųstas automatiškai. Klausimus siųskite info@2uno.lt.')}</p>
</div></body></html>`;
  const text = [title, '', ...lines, ...(button ? ['', `${button.label}: ${button.url}`] : []), '', footer || '2uno.lt'].join('\n');
  return { html, text };
}

// Grąžina { ok, id } arba { ok:false, error }. Klaidos neišmetamos – kviečiantysis sprendžia, ką daryti.
export async function sendMail(env, { to, subject, html, text, idempotencyKey }) {
  const list = (Array.isArray(to) ? to : [to]).map((x) => String(x || '').trim()).filter(Boolean);
  if (!list.length) return { ok: false, error: 'no_recipients' };
  if (!env.RESEND_API_KEY) return { ok: false, error: 'not_configured' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const r = await fetch(ENDPOINT, {
      method: 'POST', signal: ctrl.signal, headers,
      body: JSON.stringify({ from: env.MAIL_FROM || FROM, to: list, reply_to: REPLY_TO, subject, html, text }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('Resend klaida', r.status, d && d.message);
      return { ok: false, error: `http_${r.status}` };
    }
    return { ok: true, id: d.id };
  } catch (e) {
    console.error('Resend nepasiekiamas', e && e.message);
    return { ok: false, error: 'network' };
  } finally {
    clearTimeout(t);
  }
}

export function loginCodeMail(code) {
  return {
    subject: `Prisijungimo kodas: ${code}`,
    ...layout({
      title: 'Prisijungimas prie 2uno.lt partnerio portalo',
      lines: [`Jūsų vienkartinis kodas: ${code}`, 'Kodas galioja 10 minučių ir gali būti panaudotas tik vieną kartą.',
        'Jei prisijungti nebandėte, šį laišką galite ignoruoti.'],
    }),
  };
}

// Partneriui: klientas pasirašė sutartį. Be kliento duomenų – jie atrakinami tik apmokėjus.
export function newRequestMail({ origin, requestId, summary, priceEur, deadlineAt }) {
  const when = new Date(deadlineAt).toLocaleString('lt-LT', { timeZone: 'Europe/Vilnius', dateStyle: 'long', timeStyle: 'short' });
  const facts = [
    summary.legalForm && `Teisinė forma: ${summary.legalForm}`,
    summary.employees && `Darbuotojai: ${summary.employees}`,
    summary.invoices && `Sąskaitos per mėn.: ${summary.invoices}`,
    summary.vat && `PVM: ${summary.vat}`,
    summary.industry && `Veikla: ${summary.industry}`,
  ].filter(Boolean);
  return {
    subject: `Naujas klientas pasirašė sutartį (${summary.number})`,
    ...layout({
      title: 'Klientas pasirašė sutartį su jūsų įmone',
      lines: [
        `Sutarties Nr. ${summary.number}. Mėnesio kaina pagal sutartį: ${Number(priceEur).toFixed(2).replace('.', ',')} €.`,
        ...facts,
        `Kliento duomenys ir sutartis atrakinami apmokėjus komisinį mokestį. Atsakyti reikia iki ${when}.`,
      ],
      button: { label: 'Peržiūrėti užklausą', url: `${origin}/partneris?u=${encodeURIComponent(requestId)}` },
    }),
  };
}

// Gavėjai: partnerio pranešimų adresai, o jei jų nėra – partnerio naudotojų el. paštai.
export async function partnerRecipients(env, partnerId) {
  const p = await env.DB.prepare('SELECT notify_emails FROM partners WHERE id = ?').bind(partnerId).first();
  let list = [];
  try { list = JSON.parse((p && p.notify_emails) || '[]'); } catch { list = []; }
  if (!list.length) {
    const u = await env.DB.prepare('SELECT email FROM partner_users WHERE partner_id = ?').bind(partnerId).all();
    list = (u.results || []).map((x) => x.email);
  }
  return [...new Set(list.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)))].slice(0, 10);
}
