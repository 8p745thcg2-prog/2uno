// Vokų (envelope) šifravimas: kiekvienas įrašas ar failas šifruojamas atskiru
// atsitiktiniu AES-256-GCM raktu, o tas raktas – pagrindiniu raktu (MASTER_KEY),
// kuris saugomas tik Cloudflare Secrets ir niekada nepatenka į kodą ar duomenų bazę.

const VERSION = 'v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64encode(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64decode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importMasterKey(env) {
  if (!env.MASTER_KEY) throw new Error('MASTER_KEY nenustatytas');
  const raw = b64decode(env.MASTER_KEY.trim());
  if (raw.length !== 32) throw new Error('MASTER_KEY turi būti 32 baitai (base64url)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function gcmEncrypt(key, plain, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = enc.encode(aad);
  const ct = new Uint8Array(await crypto.subtle.encrypt(params, key, plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

async function gcmDecrypt(key, blob, aad) {
  const iv = blob.subarray(0, 12);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = enc.encode(aad);
  return new Uint8Array(await crypto.subtle.decrypt(params, key, blob.subarray(12)));
}

// Užšifruoja baitus. `aad` – kontekstas (pvz., sutarties ID), kad užšifruoto
// failo nebūtų galima „perkelti“ prie kito įrašo.
export async function encryptBytes(env, plainBytes, aad = '') {
  const master = await importMasterKey(env);
  const dataKeyRaw = crypto.getRandomValues(new Uint8Array(32));
  const dataKey = await crypto.subtle.importKey('raw', dataKeyRaw, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await gcmEncrypt(dataKey, plainBytes, aad);
  const wrappedKey = await gcmEncrypt(master, dataKeyRaw, 'key:' + aad);
  dataKeyRaw.fill(0);
  return { version: VERSION, wrappedKey: b64encode(wrappedKey), ciphertext };
}

export async function decryptBytes(env, { wrappedKey, ciphertext }, aad = '') {
  const master = await importMasterKey(env);
  const dataKeyRaw = await gcmDecrypt(master, b64decode(wrappedKey), 'key:' + aad);
  const dataKey = await crypto.subtle.importKey('raw', dataKeyRaw, 'AES-GCM', false, ['decrypt']);
  dataKeyRaw.fill(0);
  return gcmDecrypt(dataKey, ciphertext, aad);
}

// Teksto laukams duomenų bazėje: grąžina vieną eilutę "v1.<raktas>.<duomenys>".
export async function encryptField(env, text, aad = '') {
  if (text === null || text === undefined) return null;
  const r = await encryptBytes(env, enc.encode(String(text)), aad);
  return `${r.version}.${r.wrappedKey}.${b64encode(r.ciphertext)}`;
}

export async function decryptField(env, value, aad = '') {
  if (value === null || value === undefined) return null;
  const [version, wrappedKey, data] = String(value).split('.');
  if (version !== VERSION) throw new Error('Nežinoma šifravimo versija');
  const plain = await decryptBytes(env, { wrappedKey, ciphertext: b64decode(data) }, aad);
  return dec.decode(plain);
}

export async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Atsitiktinis, neatspėjamas ID (naudojamas URL ir užklausoms).
export function randomId(bytes = 18) {
  return b64encode(crypto.getRandomValues(new Uint8Array(bytes)));
}

// Palyginimas pastoviu laiku (slaptažodžiams, parašams).
export function safeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
