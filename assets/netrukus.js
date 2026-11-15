// „Netrukus“ puslapis: el. pašto registracija pranešimui apie 2uno.lt paleidimą.
(function () {
  const $ = (id) => document.getElementById(id);
  const show = (el, text, ok) => {
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  };

  $('wl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('wl-msg');
    const email = $('wl-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return show(msg, 'Įrašykite teisingą el. pašto adresą.', false);
    if (!$('wl-consent').checked) return show(msg, 'Pažymėkite, kad sutinkate gauti pranešimą.', false);
    const input = document.querySelector('[name="cf-turnstile-response"]');
    $('wl-submit').disabled = true;
    try {
      const r = await fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent: true, turnstile: input ? input.value : '' }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        show(msg, 'Ačiū! Pranešime, kai 2uno.lt pradės veikti.', true);
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
