(async () => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let providers = [];
  try {
    const res = await fetch('data/providers.json');
    providers = await res.json();
  } catch (e) {
    document.getElementById('companies').innerHTML = '<p>Įmonių sąrašo nepavyko įkelti. Pabandykite perkrauti puslapį.</p>';
    return;
  }

  const jump = document.getElementById('jumplist');
  const list = document.getElementById('companies');

  jump.innerHTML = providers.map((p) => `<a href="#imone-${esc(p.slug)}">${esc(p.name)}</a>`).join('');

  list.innerHTML = providers.map((p) => {
    const ratingStr = p.rating.toFixed(1).replace('.', ',');
    const featuresHtml = p.features.map((f) => `<li>${esc(f)}</li>`).join('');
    const softwareStr = Array.isArray(p.software) && p.software.length ? p.software.join(', ') : '';
    const pricingSummary = p.pricing
      ? `Nuo ${p.pricing.base} € / mėn. · ${p.pricing.annual && p.pricing.annual.included ? 'metinės įskaičiuotos' : 'metinės skaičiuojamos atskirai'}`
      : '';
    const metaItems = [];
    if (softwareStr) metaItems.push(`<span><small>Programos</small><b>${esc(softwareStr)}</b></span>`);
    if (pricingSummary) metaItems.push(`<span><small>Kainodara</small><b>${esc(pricingSummary)}</b></span>`);
    const metaHtml = metaItems.length ? `<div class="company-meta">${metaItems.join('')}</div>` : '';
    return `<article class="company" id="imone-${esc(p.slug)}">
<div class="company-head">
<div class="company-id"><div class="monogram">${esc(p.mark)}</div><div><h2>${esc(p.name)}</h2><span class="tag">${esc(p.tag)}</span></div></div>
<div class="stats"><span><span class="star">★</span> <b>${ratingStr}</b> · ${p.reviews} atsiliepimai</span><span>Pasirinko <b>${p.clients}</b> klientai</span></div>
</div>
<p class="desc">${esc(p.desc)}</p>
<ul class="features">${featuresHtml}</ul>
${metaHtml}
<div class="company-actions"><a class="btn" href="index.html#skaiciuokle">Gauti orientacinę kainą</a><a class="btn light" href="imone/${esc(p.slug)}">Plačiau apie šią įmonę →</a></div>
</article>`;
  }).join('');

  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Buhalterinės įmonės 2uno platformoje',
    itemListElement: providers.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'AccountingService',
        name: p.name,
        description: p.desc,
        areaServed: 'LT',
        aggregateRating: { '@type': 'AggregateRating', ratingValue: String(p.rating), reviewCount: String(p.reviews) },
      },
    })),
  });
  document.body.appendChild(ld);
})();
