import providers from '../../data/providers.json';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtEur(n) {
  return `${Number(n).toFixed(2).replace('.', ',')} €`;
}

function renderPage(p, baseUrl) {
  const url = `${baseUrl}/imone/${p.slug}`;
  const ratingStr = p.rating.toFixed(1).replace('.', ',');
  const allStrengths = [...(p.features || []), ...(p.highlights || [])];
  const featuresHtml = allStrengths.map((f) => `<li>${esc(f)}</li>`).join('\n');
  const software = Array.isArray(p.software) ? p.software : [];
  const softwareChips = software.map((s) => `<span class="spec-chip">${esc(s)}</span>`).join('');
  const legalFormsStr = Array.isArray(p.legalForms) ? p.legalForms.join(', ') : 'UAB, MB';
  const ws = p.workStyle || {};
  const pr = p.pricing || {};
  const inc = pr.included || { invoices: 0, bank: 0, employees: 0 };
  const ann = pr.annual || { included: false, base: 0, member: 8, employee: 4, asset: 2, vehicle: 15 };
  const isPackage = pr.model === 'package';
  const modelLabel = isPackage ? 'Planas su įskaičiuotais kiekiais' : 'Bazinis mokestis ir atskiri darbai';
  const includedText = isPackage
    ? `${inc.invoices} sąskaitų, ${inc.bank} banko operacijų, ${inc.employees} darbuotojas`
    : '0 (visi kiekiai skaičiuojami atskirai)';
  const annualShort = ann.included ? 'įskaičiuotos į mėnesinę kainą' : `vienkartinis mokestis (bazė ${ann.base} €)`;
  const annualDetailsHtml = ann.included
    ? `<p>Metinės finansinės atskaitomybės ir metinių deklaracijų parengimas nuolatiniams klientams yra <strong>įskaičiuotas į mėnesinį mokestį</strong> – atskiro metinio mokesčio nėra.</p>
<p class="pricing-sub">Jei užsakomas tik ankstesnio laikotarpio apskaitos sutvarkymas (be nuolatinės mėnesinės apskaitos), skaičiuoklėje apskaičiuojama atskira bendra suma už pasirinktus laikotarpio metus ir kiekius.</p>`
    : `<p>Metinės deklaracijos skaičiuojamos kaip <strong>vienkartinis mokestis</strong> pagal jūsų veiklos apimtį deklaruojamu laikotarpiu.</p>
<dl class="rate-list">
<div><dt>Metinių deklaracijų bazė</dt><dd>${ann.base} € be PVM</dd></div>
<div><dt>MB narių metinės paslaugos</dt><dd>${fmtEur(ann.member)}</dd></div>
<div><dt>Darbuotojų metinės paslaugos</dt><dd>${fmtEur(ann.employee)}</dd></div>
<div><dt>Ilgalaikio turto metinės paslaugos</dt><dd>${fmtEur(ann.asset)}</dd></div>
<div><dt>Transporto priemonių metinės paslaugos</dt><dd>${fmtEur(ann.vehicle)}</dd></div>
</dl>`;

  return `<!doctype html>
<html lang="lt">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light only">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} – ${esc(p.tag)} | 2UNO</title>
<meta name="description" content="${esc(p.name)}: ${esc(p.desc)} Peržiūrėkite specializaciją, apskaitos programas, kainodaros principus ir reitingą, tada gaukite orientacinę kainą per 2UNO.">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.name)} | 2UNO">
<meta property="og:description" content="${esc(p.tag)}: ${esc(p.desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<style>
:root{--ink:#0f2042;--muted:#4a5b75;--line:#e6edf4;--accent:#38b3b3;--brand:#142e52;--lime:#e6f5f5;--paper:#ffffff}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6}
a{color:inherit;text-decoration:none}button{font:inherit;cursor:pointer}
h1,h2,h3{letter-spacing:-.03em;margin:0}
.wrap{max-width:1280px;margin:auto;padding:0 32px}
header{height:68px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 max(32px,calc((100vw - 1280px)/2));background:#fff;border-bottom:1px solid var(--line)}
.brand-logo img{display:block;height:50px;width:auto;object-fit:contain}
nav{display:flex;gap:6px;align-items:center}
nav a{padding:10px 16px;font-size:14px;font-weight:500;border-radius:10px;color:#4a5b75}
nav a:hover{background:#f1f5fb;color:var(--ink)}
nav a.current{color:#166e73;background:#e6f5f5}
nav a.partner-link{color:var(--brand);background:#fff;border:1px solid #cbd5e1}
.navcta{padding:10px 18px;border-radius:10px;background:var(--brand);color:#fff;font-size:14px;font-weight:500}
.backlink{display:inline-flex;align-items:center;margin:28px 0 0;font-size:14px;font-weight:500;color:var(--brand)}
.company-hero{display:flex;align-items:center;gap:18px;margin:20px 0 12px;flex-wrap:wrap}
.monogram{width:56px;height:56px;border-radius:14px;background:#e6f5f5;color:#166e73;display:grid;place-items:center;font-weight:700;font-size:22px;flex-shrink:0}
.company-hero h1{font-size:32px;margin-bottom:6px}
.tag{display:inline-block;background:#e6f5f5;color:#166e73;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600}
.stats{display:flex;gap:20px;flex-wrap:wrap;font-size:14px;color:var(--muted);margin:14px 0 32px}
.stats b{color:var(--brand);font-size:15px}
.stats .star{color:#dfaa40}
section.block{padding:28px 32px;border:1px solid var(--line);border-radius:14px;background:#fff}
section.block h2{font-size:22px;margin-bottom:12px}
section.block p{color:var(--muted);font-size:16px}
.features{margin:16px 0 0;padding:0;list-style:none}
.features li{padding-left:24px;position:relative;font-size:15px;color:#4a5b75;line-height:1.75}
.features li:before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}
.btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--brand);border-radius:10px;background:var(--brand);color:#fff;padding:0 18px;height:40px;font-weight:500;font-size:14px;margin-top:16px}
.btn:hover{background:#1b4661;border-color:#1b4661}
.note{font-size:12px;color:#64748b;margin-top:12px}
.site-footer{max-width:1344px;margin:40px auto 0;padding:44px 32px 28px;border-top:1px solid var(--line)}
.footer-top{display:flex;gap:60px;flex-wrap:wrap;justify-content:space-between}
.footer-brand{max-width:260px}
.f-logo{display:inline-flex;align-items:center;font-weight:700;letter-spacing:-1px;font-size:20px;color:var(--ink)}
.f-logo img{display:block;height:50px;width:auto;object-fit:contain}
.footer-brand p{margin:10px 0 0;font-size:14px;color:var(--muted)}
.footer-col{display:flex;flex-direction:column;gap:10px;font-size:14px}
.footer-col h4{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 4px}
.footer-col a,.footer-col span{color:var(--muted)}
.footer-col a:hover{color:var(--brand)}
.footer-bottom{margin-top:30px;padding-top:20px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
@media(max-width:800px){.wrap{padding:0 16px}.site-footer{padding:30px 16px 20px}.footer-top{gap:28px}}
</style>
<link rel="stylesheet" href="/assets/typography.css?v=41">
</head>
<body>
<header>
<a class="logo brand-logo" href="/index.html" aria-label="2UNO pradžia"><img src="/assets/2uno-logo.png?v=2" alt="2UNO.lt"></a>
<nav>
<a href="/kaip-tai-veikia.html">Kaip veikia</a>
<a class="current" href="/imones.html">Įmonės</a>
<a href="/index.html#duk">Klausimai</a>
<a class="partner-link" href="/buhalteriams.html">Buhalteriams</a>
</nav>
<a class="navcta" href="/index.html#skaiciuokle">Rasti buhalterį</a>
</header>

<main class="wrap page-company">
<a class="backlink" href="/imones.html">← Visos įmonės</a>
<section class="company-hero">
<div class="monogram">${esc(p.mark)}</div>
<div><h1>${esc(p.name)}</h1><span class="tag">${esc(p.tag)}</span></div>
</section>
<div class="stats">
<span><span class="star">★</span> <b>${ratingStr}</b> · ${p.reviews} atsiliepimai</span>
<span>Pasirinko <b>${p.clients}</b> klientai</span>
<span>Bazinis mokestis nuo <b>${pr.base} € / mėn.</b></span>
<span>Metinės deklaracijos: <b>${esc(annualShort)}</b></span>
</div>

<section class="block company-about">
<div class="eyebrow">Apžvalga ir stiprybės</div>
<h2>Apie įmonę: ${esc(p.name)}</h2>
<p>${esc(p.summary || p.desc)}</p>
<ul class="features">
${featuresHtml}
</ul>
</section>

<section class="company-section company-specs">
<div class="eyebrow">Darbo tvarka</div>
<h2>Darbo ir apskaitos parametrai</h2>
<div class="specs-grid">
<div class="spec-item">
<h3>Apskaitos programos</h3>
<div class="spec-chips">${softwareChips}</div>
<p>Jei jau naudojate vieną iš šių programų ir klausimyne pasirinksite jos nekeisti, šis partneris bus rodomas jūsų palyginime.</p>
</div>
<div class="spec-item">
<h3>Aptarnaujamos formos ir sritys</h3>
<p class="spec-lead">${esc(legalFormsStr)}</p>
<p>${esc(ws.focus || p.desc)}</p>
</div>
<div class="spec-item">
<h3>Dokumentai ir komunikacija</h3>
<p>${esc(ws.documents || 'Dokumentai perduodami elektroniniu būdu pagal suderintą grafiką.')}</p>
<p class="spec-sub">${esc(ws.communication || 'Tiesioginis ryšys su priskirtu buhalteriu darbo dienomis.')}</p>
</div>
</div>
</section>

<section class="company-section company-pricing">
<div class="eyebrow">Kainodaros principai</div>
<h2>Mėnesio ir metinių deklaracijų skaičiavimas</h2>
<p class="section-intro">Skaičiuoklėje orientacinė kaina apskaičiuojama pagal tuos pačius tarifus, kurie pateikti žemiau, atsižvelgiant į jūsų įvestus mėnesio ar laikotarpio kiekius.</p>
<div class="pricing-grid">
<div class="pricing-panel">
<span class="pricing-badge">${esc(modelLabel)}</span>
<h3>Mėnesinė apskaita</h3>
<dl class="rate-list">
<div><dt>Bazinis mėnesio mokestis</dt><dd>nuo ${pr.base} € / mėn. be PVM</dd></div>
<div><dt>Įskaičiuota į bazę</dt><dd>${esc(includedText)}</dd></div>
<div><dt>${isPackage ? 'Sąskaita virš limito' : 'Sąskaita (pirkimo / pardavimo)'}</dt><dd>${fmtEur(pr.invoiceRate)}</dd></div>
<div><dt>Banko operacija</dt><dd>${fmtEur(pr.bankImportRate)} (importas) · ${fmtEur(pr.bankPdfRate)} (PDF)</dd></div>
<div><dt>Darbuotojo apskaita</dt><dd>${fmtEur(pr.employeeRate)} / mėn.</dd></div>
</dl>
</div>
<div class="pricing-panel">
<span class="pricing-badge">${ann.included ? 'Įskaičiuota į planą' : 'Vienkartinis mokestis'}</span>
<h3>Metinės deklaracijos</h3>
${annualDetailsHtml}
</div>
</div>
<p class="pricing-footnote">Papildomos paslaugos (PVM / SVS apskaita, kasa, ilgalaikis turtas, transporto priemonės, komandiruotės, valiutiniai ar ES / OSS sandoriai, sandėlio apskaita) skaičiuoklėje pridedamos tik tada, kai jas pažymite klausimyne. Visi įkainiai nurodyti be PVM.</p>
</section>

<section class="block company-cta">
<div class="company-cta-copy">
<div class="eyebrow">Pradėkite dabar</div>
<h2>Gaukite orientacinę kainą</h2>
<p>Užpildykite vieną klausimyną apie savo verslą – ${esc(p.name)} orientacinę kainą pamatysite iškart tarp palygintų pasiūlymų.</p>
<div class="note">Galutinę kainą ir sąlygas patvirtina pati įmonė sutarties peržiūros etape.</div>
</div>
<a class="btn" href="/index.html#skaiciuokle">Gauti orientacinę kainą</a>
</section>
</main>

<footer class="site-footer">
<div class="footer-top">
<div class="footer-brand">
<a class="f-logo" href="/index.html" aria-label="2UNO pradžia"><img src="/assets/2uno-logo.png?v=2" alt="2UNO.lt"></a>
<p>Atrinkti buhalteriai jūsų verslui.</p>
</div>
<div class="footer-col">
<h4>Naudinga informacija</h4>
<a href="/kaip-tai-veikia.html">Kaip veikia</a>
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
