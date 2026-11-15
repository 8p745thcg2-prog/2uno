// „Netrukus“ puslapis: registracija į laukiančiųjų sąrašą ir el. pašto patvirtinimas.
(function () {
  const $ = (id) => document.getElementById(id);
  const show = (el, text, ok) => {
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  };
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d };
  };

  // Atėjus iš patvirtinimo laiško (?t=…) – rodomas patvirtinimo mygtukas.
  const token = new URLSearchParams(location.search).get('t');
  if (token) {
    history.replaceState(null, '', location.pathname);
    $('signup').classList.add('hidden');
    $('confirm').classList.remove('hidden');
    $('cf-btn').addEventListener('click', async () => {
      $('cf-btn').disabled = true;
      try {
        const { ok, d } = await post('/api/waitlist/confirm', { t: token });
        if (ok) {
          show($('cf-msg'), 'Ačiū! El. paštas patvirtintas. Pranešime, kai 2uno.lt pradės veikti.', true);
          $('cf-btn').classList.add('hidden');
        } else {
          show($('cf-msg'), d.error || 'Nepavyko patvirtinti. Bandykite užsiregistruoti iš naujo.', false);
          $('cf-btn').disabled = false;
        }
      } catch {
        show($('cf-msg'), 'Nepavyko susisiekti su serveriu. Bandykite dar kartą.', false);
        $('cf-btn').disabled = false;
      }
    });
    return;
  }

  $('wl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('wl-msg');
    const email = $('wl-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return show(msg, 'Įrašykite teisingą el. pašto adresą.', false);
    if (!$('wl-consent').checked) return show(msg, 'Pažymėkite, kad sutinkate gauti pranešimą.', false);
    const input = document.querySelector('[name="cf-turnstile-response"]');
    $('wl-submit').disabled = true;
    try {
      const { ok, d } = await post('/api/waitlist', { email, consent: true, turnstile: input ? input.value : '' });
      if (ok) {
        show(msg, d.message || 'Išsiuntėme patvirtinimo laišką.', true);
        $('wl-form').querySelectorAll('input,button').forEach((x) => { x.disabled = true; });
      } else {
        show(msg, d.error || 'Nepavyko. Bandykite dar kartą.', false);
        $('wl-submit').disabled = false;
        if (window.turnstile) window.turnstile.reset();
      }
    } catch {
      show(msg, 'Nepavyko susisiekti su serveriu. Bandykite dar kartą.', false);
      $('wl-submit').disabled = false;
    }
  });
})();
