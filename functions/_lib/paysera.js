// Paysera Checkout Modern API klientas (OAuth2 client_credentials).
// Aplinkos paslaptys: PAYSERA_CLIENT_ID, PAYSERA_CLIENT_SECRET, PAYSERA_PROJECT_ID (Cloudflare Pages secrets, niekada repo'je).

const AUTH_URL = 'https://api.paysera.com/auth/realms/Paysera/protocol/openid-connect/token';
const API_BASE = 'https://api.paysera.com';

async function getAccessToken(env) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.PAYSERA_CLIENT_ID,
    client_secret: env.PAYSERA_CLIENT_SECRET,
  });
  const r = await fetch(AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Paysera auth klaida: ${r.status} ${JSON.stringify(d)}`);
  return d.access_token;
}

async function call(env, method, path, body) {
  const token = await getAccessToken(env);
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Paysera API klaida (${path}): ${r.status} ${JSON.stringify(d)}`);
  return d;
}

// Sukuria užsakymą. amountCents – sveikasis skaičius (centais).
export async function createOrder(env, { reference, amountCents, currency = 'EUR', successUrl, failureUrl, callbackUrl }) {
  return call(env, 'POST', '/merchant-order/integration/v1/orders', {
    project_id: env.PAYSERA_PROJECT_ID,
    purchase: { reference, amount: String(amountCents), currency },
    redirect_urls: { success_url: successUrl, failure_url: failureUrl, callback_url: callbackUrl },
  });
}

// Sukuria mokėjimo nuorodą konkrečiam užsakymui. Grąžina { id, payment_URL, ... }.
export async function createPaymentLink(env, { orderId, amountCents, name, language = 'lt', lifetime }) {
  return call(env, 'POST', '/checkout-payment-link/integration/v1/payment-links', {
    order_id: orderId,
    name,
    experience: { language },
    purchase: { amount: String(amountCents) },
    ...(lifetime != null ? { lifetime } : {}),
  });
}

// Autoritetingas užsakymo būsenos patikrinimas (naudojamas webhook'e – niekada nesitikima vien webhook turiniu).
export async function getOrder(env, orderId) {
  return call(env, 'GET', `/merchant-order/integration/v1/orders/${orderId}`);
}

// Webhook pasirašymo patikra (papildomas sluoksnis – tikras patvirtinimas visada per getOrder su mūsų OAuth raktu).
export async function verifyWebhookSignature(env, rawBody, signatureHeader) {
  if (!signatureHeader || !env.PAYSERA_CLIENT_SECRET) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.PAYSERA_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex === String(signatureHeader).trim().toLowerCase();
  } catch {
    return false;
  }
}
