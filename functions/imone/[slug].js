import providers from '../../data/providers.json';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderPage(p, baseUrl) {
  const url = `${baseUrl}/imone/${p.slug}`;
  const ratingStr = p.rating.toFixed(1).replace('.', ',');
  const featuresHtml = p.features.map((f) => `<li>${esc(f)}</li>`).join('\n');
  return `<!doctype html>
<html lang="lt">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light only">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} – ${esc(p.tag)} | 2uno</title>
<meta name="description" content="${esc(p.name)}: ${esc(p.desc)} Peržiūrėkite specializaciją, stiprybes ir reitingą, tada gaukite orientacinę kainą per 2uno.">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.name)} | 2uno">
<meta property="og:description" content="${esc(p.tag)}: ${esc(p.desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<style>
:root{--ink:#152b59;--muted:#64758e;--line:#e8edf2;--accent:#279da7;--brand:#173777;--lime:#dff2f1;--paper:#f7f9fc}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6}
a{color:inherit;text-decoration:none}button{font:inherit;cursor:pointer}
h1,h2,h3{letter-spacing:-.03em;margin:0}
.wrap{max-width:760px;margin:auto;padding:0 24px}
header{height:88px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 max(24px,calc((100vw - 1360px)/2));background:#fff;border-bottom:1px solid var(--line)}
.brand-logo img{display:block;width:130px;height:76px;object-fit:contain}
nav{display:flex;gap:6px;align-items:center}
nav a{padding:10px 16px;font-size:13px;font-weight:600;border-radius:8px;color:#66758b}
nav a:hover{background:#f5f7fa;color:var(--ink)}
nav a.current{color:var(--brand);background:#eef3fb}
nav a.partner-link{color:#25818a;background:#eef8f7}
.navcta{padding:11px 19px;border-radius:9px;background:var(--ink);color:#fff;font-size:12px;font-weight:600}
.backlink{display:inline-block;margin:28px 0 0;font-size:13px;font-weight:600;color:#3a5674}
.backlink:hover{color:var(--brand)}
.company-hero{display:flex;align-items:flex-start;gap:18px;margin:20px 0 10px;flex-wrap:wrap}
.monogram{width:60px;height:60px;border-radius:14px;background:#eaf6f6;color:var(--accent);display:grid;place-items:center;font-weight:700;font-size:24px;flex-shrink:0}
.company-hero h1{font-size:30px;margin-bottom:6px}
.tag{display:inline-block;background:#f0f7f7;color:#378890;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600}
.stats{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:16px 0 30px}
.stats b{color:var(--ink);font-size:15px}
.stats .star{color:#dfaa40}
section.block{padding:26px 0;border-top:1px solid var(--line)}
section.block h2{font-size:21px;margin-bottom:12px}
section.block p{color:var(--muted);font-size:15px}
.features{margin:10px 0 0;padding:0;list-style:none}
.features li{padding-left:22px;position:relative;font-size:14px;color:#53677e;line-height:1.9}
.features li:before{content:"✓";position:absolute;left:0;color:var(--accent)}
.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:9px;background:var(--brand);color:#fff;padding:13px 20px;font-weight:600;font-size:14px;margin-top:6px}
.btn:hover{background:#234c9b}
.note{font-size:12px;color:#8a99a9;margin-top:10px}
footer{max-width:1420px;margin:40px auto 0;padding:25px 30px;display:flex;gap:22px;align-items:center;justify-content:space-between;font-size:11px;color:var(--muted);border-top:1px solid var(--line)}
@media(max-width:800px){header{height:auto;min-height:76px;flex-wrap:wrap;padding:8px 16px}nav{order:3;width:100%;overflow-x:auto;padding-bottom:6px}.company-hero h1{font-size:24px}}
</style>
</head>
<body>
<header>
<a class="logo brand-logo" href="/index.html" aria-label="2uno pradžia"><img src="/assets/2uno-logo.jpg" alt="2UNO.lt"></a>
<nav>
<a href="/index.html">Pradžia</a>
<a href="/kaip-tai-veikia.html">Kaip tai veikia</a>
<a class="current" href="/imones.html">Įmonės</a>
<a href="/index.html#duk">Klausimai</a>
<a class="partner-link" href="/buhalteriams.html">Buhalteriams</a>
</nav>
<a class="navcta" href="/index.html#skaiciuokle">Rasti buhalterį</a>
</header>

<main class="wrap">
<a class="backlink" href="/imones.html">← Visos įmonės</a>
<section class="company-hero">
<div class="monogram">${esc(p.mark)}</div>
<div><h1>${esc(p.name)}</h1><span class="tag">${esc(p.tag)}</span></div>
</section>
<div class="stats"><span><span class="star">★</span> <b>${ratingStr}</b> · ${p.reviews} atsiliepimai</span><span>Pasirinko <b>${p.clients}</b> klientai</span></div>

<section class="block">
<h2>Apie ${esc(p.name)}</h2>
<p>${esc(p.desc)}</p>
<ul class="features">
${featuresHtml}
</ul>
</section>

<section class="block">
<h2>Gaukite orientacinę kainą</h2>
<p>Užpildykite vieną klausimyną apie savo verslą – ${esc(p.name)} orientacinę kainą pamatysite iškart tarp palygintų pasiūlymų.</p>
<a class="btn" href="/index.html#skaiciuokle">Gauti orientacinę kainą</a>
<div class="note">Galutinę kainą ir sąlygas patvirtina pati įmonė sutarties peržiūros etape.</div>
</section>
</main>

<footer>
<span style="font-weight:700;letter-spacing:-1px;font-size:20px">2uno.</span>
<span>Atrinkti buhalteriai jūsų verslui</span>
<span>© 2026 2uno</span>
<a href="/teisiniai-dokumentai.html">Privatumas ir taisyklės</a>
</footer>

<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'AccountingService',
  name: p.name,
  description: p.desc,
  areaServed: 'LT',
  aggregateRating: { '@type': 'AggregateRating', ratingValue: String(p.rating), reviewCount: String(p.reviews) },
})}
</script>
</body>
</html>
`;
}

export async function onRequestGet(context) {
  const { params, request } = context;
  const slug = params.slug;
  const provider = providers.find((p) => p.slug === slug);
  if (!provider) {
    return new Response('Not found', { status: 404 });
  }
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const html = renderPage(provider, baseUrl);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
