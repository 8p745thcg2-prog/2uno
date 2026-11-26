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
<title>${esc(p.name)} – ${esc(p.tag)} | 2UNO</title>
<meta name="description" content="${esc(p.name)}: ${esc(p.desc)} Peržiūrėkite specializaciją, stiprybes ir reitingą, tada gaukite orientacinę kainą per 2UNO.">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.name)} | 2UNO">
<meta property="og:description" content="${esc(p.tag)}: ${esc(p.desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<style>
:root{--ink:#0f2042;--muted:#4a5b75;--line:#e2e8f0;--accent:#38b3b3;--brand:#142e52;--lime:#e6f5f5;--paper:#ffffff}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink)}
a{color:inherit;text-decoration:none}button{font:inherit;cursor:pointer}
h1,h2,h3,h4{margin:0}
.wrap{max-width:760px;margin:auto;padding:0 24px}
.backlink{display:inline-block;margin:28px 0 0;font-size:13px;font-weight:600;color:#3a5674}
.backlink:hover{color:var(--brand)}
.company-hero{display:flex;align-items:flex-start;gap:18px;margin:20px 0 10px;flex-wrap:wrap}
.monogram{width:60px;height:60px;border-radius:14px;background:#e6f5f5;color:#166e73;display:grid;place-items:center;font-weight:700;font-size:24px;flex-shrink:0}
.company-hero h1{margin-bottom:6px}
.tag{display:inline-block;background:#e6f5f5;color:#166e73;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600}
.stats{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:16px 0 30px}
.stats b{color:var(--ink);font-size:15px}
.stats .star{color:#dfaa40}
section.block{padding:26px 0;border-top:1px solid var(--line)}
section.block h2{margin-bottom:12px}
section.block p{margin:0}
.features{margin:10px 0 0;padding:0;list-style:none}
.features li{padding-left:22px;position:relative;font-size:14px;color:#4a5b75;line-height:1.9}
.features li:before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}
.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:9px;background:var(--brand);color:#fff;padding:12px 18px;font-weight:600;font-size:13px;margin-top:6px}
.btn:hover{background:#1b4661}
.note{font-size:12px;color:var(--muted);margin-top:10px}
.site-footer{max-width:1420px;margin:40px auto 0;padding:40px 30px 25px;border-top:1px solid var(--line)}
.footer-top{display:flex;gap:60px;flex-wrap:wrap;justify-content:space-between}
.footer-brand{max-width:260px}
.f-logo{font-weight:700;letter-spacing:-1px;font-size:20px;color:var(--ink)}
.footer-brand p{margin:10px 0 0;color:var(--muted)}
.footer-col{display:flex;flex-direction:column;gap:10px}
.footer-col h4{margin:0 0 4px}
.footer-col a,.footer-col span{color:var(--muted)}
.footer-col a:hover{color:var(--ink)}
.footer-bottom{margin-top:30px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted)}
@media(max-width:800px){.wrap{padding:0 16px}.site-footer{padding:30px 16px 20px}.footer-top{gap:28px}}
</style>
<link rel="stylesheet" href="/assets/typography.css?v=58">
</head>
<body>
<header>
<a class="logo brand-logo" href="/index.html" aria-label="2UNO pradžia"><img src="/assets/2uno-logo-crop.jpg" alt="2UNO.lt"></a>
<nav>
<a href="/index.html">Pradžia</a>
<a href="/kaip-tai-veikia.html">Kaip tai veikia</a>
<a class="current" href="/imones.html">Įmonės</a>
<a href="/index.html#duk">Klausimai</a>
<a class="partner-link" href="/buhalteriams.html">Buhalteriams</a>
</nav>
<a class="navcta" href="/index.html#skaiciuokle">Rasti buhalterį</a>
<details class="nav-mobile"><summary class="nav-toggle" aria-label="Meniu"><span aria-hidden="true"></span></summary><div class="nav-mobile-panel" aria-label="Navigacija">
<a href="/index.html">Pradžia</a>
<a href="/kaip-tai-veikia.html">Kaip tai veikia</a>
<a class="current" href="/imones.html">Įmonės</a>
<a href="/index.html#duk">Klausimai</a>
<a class="partner-link" href="/buhalteriams.html">Buhalteriams</a>
</div></details>
</header>

<main class="wrap page-company">
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

<footer class="site-footer">
<div class="footer-top">
<div class="footer-brand">
<a class="f-logo" href="/index.html">2UNO</a>
<p>Atrinkti buhalteriai jūsų verslui.</p>
</div>
<div class="footer-col">
<h4>Naudinga informacija</h4>
<a href="/kaip-tai-veikia.html">Kaip tai veikia</a>
<a href="/imones.html">Įmonės</a>
<a href="/buhalteriams.html">Buhalteriams</a>
<a href="/index.html#duk">Dažniausi klausimai</a>
<a href="/teisiniai-dokumentai.html">Privatumas ir taisyklės</a>
</div>
<div class="footer-col">
<h4>Kontaktai</h4>
<span>Ežero g. 65, Šiauliai</span>
<a href="tel:+37064111306">+370 641 11306</a>
<a href="mailto:info@2uno.lt">info@2uno.lt</a>
</div>
</div>
<div class="footer-bottom">
<span>© 2026 2UNO</span>
</div>
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
