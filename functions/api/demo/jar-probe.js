import { json, notFound, isProduction } from '../../_lib/http.js';

// LAIKINA: tik testinėje aplinkoje, tik get.data.gov.lt JAR modeliams. Bus pašalinta.
const ALLOWED = /^(buveines\/Buveine|valdymo_organai\/ValdymoOrganas|iregistruoti\/JuridinisAsmuo|formos_statusai\/Forma)(\/:format\/(json|csv))?$/;

export async function onRequestGet({ request, env }) {
  if (isProduction(env)) return notFound();
  const u = new URL(request.url);
  const model = u.searchParams.get('m') || '';
  const q = u.searchParams.get('q') || '';
  const bytes = Math.min(Number(u.searchParams.get('b') || 3000), 20000);
  if (!ALLOWED.test(model) || !/^[\w().,=<>'"&:-]*$/.test(q)) return json({ error: 'netinkama' }, 400);
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(`https://get.data.gov.lt/datasets/gov/rc/jar/${model}${q ? '?' + q : ''}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const reader = r.body.getReader();
    let got = new Uint8Array(0);
    while (got.length < bytes) {
      const { value, done } = await reader.read();
      if (done) break;
      const n = new Uint8Array(got.length + value.length);
      n.set(got); n.set(value, got.length); got = n;
    }
    reader.cancel().catch(() => {});
    return json({ ms: Date.now() - t0, status: r.status, type: r.headers.get('content-type'), body: new TextDecoder().decode(got.slice(0, bytes)) });
  } catch (e) {
    return json({ ms: Date.now() - t0, error: String(e) });
  } finally {
    clearTimeout(timer);
  }
}
