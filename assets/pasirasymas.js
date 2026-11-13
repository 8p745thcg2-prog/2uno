(function () {
  var form = document.getElementById('f');
  var F = function (n) { return form.elements[n]; };
  var data = null;
  try { data = JSON.parse(sessionStorage.getItem('2uno-sign') || 'null'); } catch (e) { data = null; }

  function msg(el, kind, text) { el.className = 'msg ' + kind; el.textContent = text; }
  function eur(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }
  function add(dl, k, v) { var dt = document.createElement('dt'); dt.textContent = k; var dd = document.createElement('dd'); dd.textContent = v || '–'; dl.appendChild(dt); dl.appendChild(dd); }

  var choice = document.getElementById('choice');
  if (!data || !data.providerName) {
    document.getElementById('nochoice').hidden = false;
    document.getElementById('signBtn').disabled = true;
  } else {
    add(choice, 'Buhalterinė įmonė', data.providerName);
    add(choice, 'Orientacinė kaina', eur(data.priceEur) + ' per mėn. be PVM');
    add(choice, 'Veiklos forma', data.summary.legalForm);
    add(choice, 'Situacija', data.summary.situation);
    add(choice, 'Darbuotojai', data.summary.employees);
    add(choice, 'Sąskaitos', data.summary.invoices);
    if (data.summary.startDate) add(choice, 'Paslaugų pradžia', data.summary.startDate);
    if (data.client) {
      if (data.client.code) F('code').value = data.client.code;
      if (data.client.name) F('name').value = data.client.name;
      if (data.client.representative) F('representative').value = data.client.representative;
    }
  }

  function lookup() {
    var code = F('code').value.trim(), vat = F('vat').value.replace(/\s/g, '');
    var out = document.getElementById('lookupMsg');
    if (!/^\d{9}$/.test(code)) { msg(out, 'bad', 'Įmonės kodą sudaro 9 skaitmenys.'); return; }
    msg(out, 'warn', 'Ieškoma registre...');
    fetch('/api/company?code=' + encodeURIComponent(code) + (vat ? '&vat=' + encodeURIComponent(vat) : ''))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { msg(out, 'bad', d.error); return; }
        if (!d.found) { msg(out, 'warn', 'Įmonė registre nerasta. Įveskite duomenis ranka.'); return; }
        if (d.name) F('name').value = d.legalFormShort && d.name.indexOf(d.legalFormShort) === -1 ? d.legalFormShort + ' „' + d.name + '“' : d.name;
        if (d.address) F('address').value = d.address;
        if (d.vatCode) F('vat').value = d.vatCode;
        msg(out, d.active === false ? 'bad' : 'ok', d.active === false ? 'Dėmesio: įmonė išregistruota.' : 'Duomenys užpildyti iš registro.' + (d.address ? '' : ' Adresą įveskite ranka.'));
      })
      .catch(function () { msg(out, 'warn', 'Registras šiuo metu nepasiekiamas. Įveskite duomenis ranka.'); });
  }
  document.getElementById('lookup').addEventListener('click', lookup);
  F('code').addEventListener('change', function () { if (/^\d{9}$/.test(this.value.trim())) lookup(); });
  if (data && data.client && /^\d{9}$/.test(data.client.code || '')) lookup();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    form.querySelectorAll('.err').forEach(function (x) { x.textContent = ''; });
    var client = {};
    ['name', 'code', 'vat', 'address', 'representative', 'position', 'basis', 'email', 'phone', 'bank'].forEach(function (k) { client[k] = F(k).value; });
    var body = {
      providerName: data.providerName, priceEur: data.priceEur, summary: data.summary, client: client,
      signature: { fullName: F('fullName').value.trim(), consent: F('consent').checked },
      turnstile: (form.querySelector('[name="cf-turnstile-response"]') || {}).value || '',
    };
    var btn = document.getElementById('signBtn'); btn.disabled = true;
    msg(document.getElementById('signMsg'), 'warn', 'Pasirašoma ir saugiai išsaugoma...');
    fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (x) {
        if (x.s !== 201) {
          var w = form.querySelector('.cf-turnstile'); if (window.turnstile && w) try { window.turnstile.reset(w); } catch (er) {}
          msg(document.getElementById('signMsg'), 'bad', x.d.error || 'Klaida');
          if (x.d.fields) Object.keys(x.d.fields).forEach(function (k) { var el = form.querySelector('[data-for=' + k + ']'); if (el) el.textContent = x.d.fields[k]; });
          btn.disabled = false; return;
        }
        sessionStorage.removeItem('2uno-sign');
        document.getElementById('form-area').style.display = 'none';
        document.getElementById('doneText').textContent = 'Sutartis su ' + data.providerName + ' pasirašyta ir saugiai išsaugota.';
        document.getElementById('doneNumber').textContent = x.d.number;
        document.getElementById('doneLink').href = x.d.downloadUrl;
        document.getElementById('done').classList.add('show');
        window.scrollTo(0, 0);
      })
      .catch(function () { msg(document.getElementById('signMsg'), 'bad', 'Nepavyko susisiekti su serveriu.'); btn.disabled = false; });
  });
})();
