export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function notFound() {
  return json({ error: 'Nerasta' }, 404);
}

// Saugus numatytasis režimas: viskas, kas nėra aiškiai pažymėta kaip testinė aplinka, laikoma produkcija.
export function isProduction(env) {
  return env.APP_ENV !== 'test';
}

// Saugiai nuskaito JSON užklausos kūną su dydžio riba.
export async function readJson(request, maxBytes = 16 * 1024) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new Error('Netinkamas turinio tipas');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('Per didelė užklausa');
  return JSON.parse(text);
}

// Leidžia tik to paties šaltinio POST užklausas (apsauga nuo CSRF).
export function sameOrigin(request) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function audit(env, { actorType, actorId = null, action, objectType = null, objectId = null, request = null }) {
  const ip = request ? request.headers.get('CF-Connecting-IP') : null;
  await env.DB.prepare(
    'INSERT INTO audit_log (actor_type, actor_id, action, object_type, object_id, ip) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(actorType, actorId, action, objectType, objectId, ip).run();
}
