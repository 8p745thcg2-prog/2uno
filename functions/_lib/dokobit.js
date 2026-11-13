// Dokobit Documents Gateway – kvalifikuotas el. parašas (Smart-ID, mobilusis parašas, kortelė).
// Parengta pagal viešą dokumentaciją ir oficialų pavyzdį (github.com/dokobit/gateway-php-example).
// Įjungiama tik nustatčius paslaptį DOKOBIT_ACCESS_TOKEN; DOKOBIT_URL – sandbox arba produkcijos adresas.
// PASTABA: gavus sandbox prieigą, patikrinti laukų pavadinimus ir būsenos kelią (pažymėta „TIKRINTI“).

const DEFAULT_URL = 'https://gateway-sandbox.dokobit.com';
const TIMEOUT_MS = 20000;

export function dokobitEnabled(env) {
  return !!env.DOKOBIT_ACCESS_TOKEN;
}

function baseUrl(env) {
  return String(env.DOKOBIT_URL || DEFAULT_URL).replace(/\/+$/, '');
}

// Įdėtiniai laukai formos pavidalu, kaip PHP http_build_query: signers[0][id]=…
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(env, action, { method = 'POST', fields } = {}) {
  const url = `${baseUrl(env)}/api/${action}.json?access_token=${encodeURIComponent(env.DOKOBIT_ACCESS_TOKEN)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const init = { method, signal: ctrl.signal, headers: { Accept: 'application/json' } };
    if (method === 'POST') {
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = formEncode(fields || {}).toString();
    }
    const r = await fetch(url, init);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.status === 'error') throw new Error(`Dokobit ${action}: ${r.status} ${d.message || d.error || ''}`.trim());
    return d;
  } finally {
    clearTimeout(t);
  }
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Įkelia PDF ir sukuria pasirašymą vienam pasirašančiajam. Grąžina { signingToken, signerUrl }.
export async function createSigning(env, { pdf, fileName, title, signer, postbackUrl, pollMs = 1500 }) {
  const up = await call(env, 'file/upload', {
    fields: { file: { name: fileName, digest: await sha256Hex(pdf), content: b64(pdf) } },
  });
  // TIKRINTI: dokumentacijoje nurodytas ir kelias file/upload/{token}/status
  for (let i = 0; i < 10; i++) {
    const st = await call(env, `file/upload/status/${encodeURIComponent(up.token)}`, { method: 'GET' });
    if (st.status === 'uploaded') break;
    if (st.status !== 'pending' || i === 9) throw new Error('Dokobit: failas neįkeltas');
    await sleep(pollMs);
  }
  const created = await call(env, 'signing/create', {
    fields: {
      type: 'pdf',
      name: title,
      files: { 0: { token: up.token } },
      signers: {
        0: {
          id: signer.id, name: signer.name, surname: signer.surname, country_code: 'LT',
          signing_purpose: 'signature', signing_options: { 0: 'smartid', 1: 'mobile', 2: 'stationary' },
        },
      },
      postback_url: postbackUrl,
    },
  });
  const signerToken = created.signers && created.signers[signer.id];
  if (!created.token || !signerToken) throw new Error('Dokobit: neatsakė pasirašymo duomenimis');
  return {
    signingToken: created.token,
    signerUrl: `${baseUrl(env)}/signing/${encodeURIComponent(created.token)}?access_token=${encodeURIComponent(signerToken)}`,
  };
}

// Pasirašymo būsena tiesiai iš Dokobit (postback turiniu nepasitikima). { status, fileUrl, signerInfo }.
export async function signingStatus(env, signingToken) {
  const d = await call(env, `signing/${encodeURIComponent(signingToken)}/status`, { method: 'GET' });
  return { status: d.status, fileUrl: d.file || null, signers: d.signers || {} };
}

// Atsisiunčia pasirašytą failą. Leidžiami tik Dokobit adresai.
export async function downloadSigned(env, fileUrl) {
  const u = new URL(fileUrl);
  if (u.origin !== new URL(baseUrl(env)).origin) throw new Error('Dokobit: netikėtas failo adresas');
  u.searchParams.set('access_token', env.DOKOBIT_ACCESS_TOKEN);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`Dokobit: failo atsisiuntimas ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new Error('Dokobit: gautas ne PDF');
  return bytes;
}

// Vardas ir pavardė iš vieno lauko („Jonas Jonaitis“ → name, surname).
export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  const surname = parts.length > 1 ? parts.pop() : '';
  return { name: parts.join(' '), surname };
}
