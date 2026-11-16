(function () {
  var form = document.getElementById('f');
  var $ = function (n) { return form.elements[n]; };
  var lookupBtn = document.getElementById('lookup');
  var lookupStatus = document.getElementById('lookupStatus');
  var genBtn = document.getElementById('gen');
  var genStatus = document.getElementById('genStatus');

  function status(el, kind, text) { el.className = 'status ' + kind; el.textContent = text; }
  function clearErrors() { form.querySelectorAll('.err').forEach(function (e) { e.textContent = ''; }); }
  function fmt(iso) { return new Date(iso).toLocaleString('lt-LT'); }

  function lookup() {
    clearErrors();
    var code = $('code').value.trim();
    var vat = $('vat').value.replace(/\s/g, '');
    if (!/^\d{9}$/.test(code)) { form.querySelector('[data-for=code]').textContent = 'Įmonės kodą sudaro 9 skaitmenys'; return; }
    lookupBtn.disabled = true;
    status(lookupStatus, 'warn', 'Ieškoma Registrų centre...');
    var q = '/api/company?code=' + encodeURIComponent(code) + (vat ? '&vat=' + encodeURIComponent(vat) : '');
    fetch(q, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { status(lookupStatus, 'bad', d.error); return; }
        if (!d.found) { status(lookupStatus, 'warn', 'Įmonė nerasta (galbūt ką tik įregistruota). Įveskite duomenis ranka.'); return; }
        if (d.name) $('name').value = d.legalFormShort && d.name.indexOf(d.legalFormShort) === -1 ? d.legalFormShort + ' „' + d.name + '“' : d.name;
        if (d.address) $('address').value = d.address;
        if (d.vatCode) $('vat').value = d.vatCode;
        var parts = ['Rasta: ' + d.source.join(' + ') + '.'];
        if (d.legalForm) parts.push('Forma: ' + d.legalForm + '.');
        if (d.active === false) parts.push('DĖMESIO: įmonė išregistruota ' + d.deregisteredAt + '.');
        if (!d.address) parts.push('Adreso registre nėra – įveskite ranka.');
        if (d.vatValid === false) parts.push('PVM kodas VIES sistemoje negalioja.');
        status(lookupStatus, d.active === false ? 'bad' : 'ok', parts.join(' '));
      })
      .catch(function () { status(lookupStatus, 'bad', 'Paieška nepavyko. Įveskite duomenis ranka.'); })
      .finally(function () { lookupBtn.disabled = false; });
  }

  lookupBtn.addEventListener('click', lookup);
  $('code').addEventListener('change', function () { if (/^\d{9}$/.test(this.value.trim())) lookup(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    var body = {};
    ['name', 'code', 'vat', 'address', 'representative', 'position', 'basis', 'email', 'phone', 'bank'].forEach(function (k) { body[k] = $(k).value; });
    genBtn.disabled = true;
    status(genStatus, 'warn', 'Generuojama ir šifruojama...');
    fetch('/api/demo/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (x) {
        if (x.s !== 201) {
          status(genStatus, 'bad', x.d.error || 'Klaida');
          if (x.d.fields) Object.keys(x.d.fields).forEach(function (k) { var el = form.querySelector('[data-for=' + k + ']'); if (el) el.textContent = x.d.fields[k]; });
          return;
        }
        genStatus.className = 'status';
        document.getElementById('rNumber').textContent = x.d.number;
        document.getElementById('rHash').textContent = x.d.sha256;
        document.getElementById('rExpires').textContent = fmt(x.d.linkExpiresAt);
        document.getElementById('rDelete').textContent = fmt(x.d.deleteAfter);
        document.getElementById('rLink').href = x.d.downloadUrl;
        var res = document.getElementById('result');
        res.style.display = 'block';
        res.scrollIntoView({ behavior: 'smooth' });
      })
      .catch(function () { status(genStatus, 'bad', 'Nepavyko susisiekti su serveriu.'); })
      .finally(function () { genBtn.disabled = false; });
  });
})();
