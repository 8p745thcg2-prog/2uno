(function () {
  var form = document.getElementById('f');
  var F = function (n) { return form.elements[n]; };
  var data = null;
  try { data = JSON.parse(sessionStorage.getItem('2uno-sign') || 'null'); } catch (e) { data = null; }

  function msg(el, kind, text) { el.className = 'msg ' + kind; el.textContent = text; }
  function eur(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }
  function add(dl, k, v) { var dt = document.createElement('dt'); dt.textContent = k; var dd = document.createElement('dd'); dd.textContent = v || '–'; dl.appendChild(dt); dl.appendChild(dd); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Pareigos: pasirenkama iš sąrašo arba įrašoma ranka pasirinkus „Kita“. Reali reikšmė laikoma
  // paslėptame form.elements['position'] lauke, kad jį galėtų nuskaityti esamas pateikimo (submit) kodas.
  var positionSelect = document.getElementById('position-select');
  var positionOther = document.getElementById('position-other');
  var positionOtherWrap = document.getElementById('position-other-wrap');
  function syncPosition() { F('position').value = positionSelect.value === 'Kita' ? positionOther.value.trim() : positionSelect.value; }
  positionSelect.addEventListener('change', function () { positionOtherWrap.classList.toggle('hidden', positionSelect.value !== 'Kita'); syncPosition(); clearFieldError('position'); refreshPreview(); });
  positionOther.addEventListener('input', function () { syncPosition(); clearFieldError('position'); refreshPreview(); });

  function fieldInput(name) { return (name === 'position' ? positionSelect : form.elements[name]); }
  function markFieldError(name, text) { var el = fieldInput(name); if (el) el.classList.add('invalid'); var errEl = form.querySelector('[data-for=' + name + ']'); if (errEl) errEl.textContent = text; }
  function clearFieldError(name) { var el = fieldInput(name); if (el) el.classList.remove('invalid'); var errEl = form.querySelector('[data-for=' + name + ']'); if (errEl) errEl.textContent = ''; }
  function clearAllFieldErrors() { form.querySelectorAll('.err').forEach(function (x) { x.textContent = ''; }); form.querySelectorAll('.invalid').forEach(function (x) { x.classList.remove('invalid'); }); }

  // Patikrina įmonės ir pasirašančio asmens duomenis (reikalinga ir peržiūrai, ir pasirašymui).
  function validateClientFields() {
    clearAllFieldErrors();
    var ok = true;
    if (!/^\d{9}$/.test(F('code').value.trim())) { markFieldError('code', 'Įmonės kodą sudaro 9 skaitmenys.'); ok = false; }
    if (!F('name').value.trim()) { markFieldError('name', 'Nurodykite įmonės pavadinimą.'); ok = false; }
    if (!F('address').value.trim()) { markFieldError('address', 'Nurodykite buveinės adresą.'); ok = false; }
    if (!F('representative').value.trim()) { markFieldError('representative', 'Nurodykite atstovo vardą ir pavardę.'); ok = false; }
    if (!F('position').value.trim()) { markFieldError('position', 'Nurodykite atstovo pareigas.'); ok = false; }
    return ok;
  }
  function validateSignFields() {
    var ok = validateClientFields();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(F('email').value.trim())) { markFieldError('email', 'Nurodykite galiojantį el. paštą.'); ok = false; }
    if (!F('fullName').value.trim()) { markFieldError('fullName', 'Įrašykite vardą ir pavardę parašui.'); ok = false; }
    if (!F('consent').checked) { markFieldError('consent', 'Reikia sutikti su sutarties sąlygomis.'); ok = false; }
    return ok;
  }

  // Sutarties peržiūra: VISAS sutarties projekto tekstas (perduotas iš palyginimo puslapio kaip
  // data.contractHtml - apima paslaugų apimtį, kainos skaičiavimą, metines deklaracijas ir t.t.),
  // kurio 1-ą skyrių (šalys) čia perrašome su jau įvestais tikrais įmonės/atstovo duomenimis, kad
  // pasirašymo puslapyje būtų matoma visa sutartis, ne tik glausta santrauka.
  function refreshPreview() {
    var box = document.getElementById('contractPreview');
    if (!box.classList.contains('show')) return;
    box.innerHTML = buildPreview();
  }
  function buildPreview() {
    if (!data || !data.providerName) return '';
    var parties = '' +
      '<h4>1. Sutarties šalys</h4><p>Klientas: ' + esc(F('name').value || '[įmonės pavadinimas]') + ', kodas ' + esc(F('code').value || '[įmonės kodas]') +
      (F('vat').value.trim() ? ', PVM kodas ' + esc(F('vat').value.trim()) : '') + ', buveinės adresas: ' + esc(F('address').value || '[adresas]') + '.<br>' +
      'Atstovas: ' + esc(F('representative').value || '[vardas ir pavardė]') + ', pareigos: ' + esc(F('position').value || '[pareigos]') + ', veikia pagal ' + esc(F('basis').value) + '.<br>' +
      'Paslaugų teikėjas: <b>' + esc(data.providerName) + '</b>. Teikėjo rekvizitai ir įgaliotas atstovas turi būti patvirtinti.</p>';
    // Sekcijos nuo "2. Paslaugų apimtis" toliau - jau paruoštos palyginimo puslapyje su visu kainos
    // skaičiavimu. Senesniems (dar be contractHtml) sessionStorage įrašams - atsarginis trumpas variantas.
    var rest = data.contractHtml || '';
    var idx = rest.indexOf('<h4>2.');
    if (idx !== -1) {
      rest = rest.slice(idx);
    } else {
      var s = data.summary || {};
      rest = '<h4>2. Paslaugų apimtis</h4><p>Veiklos forma: ' + esc(s.legalForm) + '. Situacija: ' + esc(s.situation) + '. Darbuotojai: ' + esc(s.employees) + '. Sąskaitos: ' + esc(s.invoices) + '.</p>' +
        '<h4>3. Kaina</h4><p>Orientacinė suma: <b>' + eur(data.priceEur) + ' / mėn. be PVM</b>. Galutinę kainą ir sąlygas patvirtina pasirinkta buhalterinė įmonė savo sutartyje.</p>' +
        '<h4>4. Pradžia</h4><p>' + (s.startDate ? 'Pageidaujama pradžia: ' + esc(s.startDate) + '.' : 'Pradžios data nenurodyta.') + '</p>' +
        '<h4>5. Pasirašymas</h4><p>Tai orientacinė santrauka, ne galutinis dokumentas. Sutartis bus sudaroma pagal ' + esc(data.providerName) + ' naudojamą šabloną ir pasirašoma kvalifikuotu elektroniniu parašu.</p>';
    }
    return parties + rest;
  }
  document.getElementById('previewBtn').addEventListener('click', function () {
    validateClientFields();
    var box = document.getElementById('contractPreview');
    box.classList.add('show');
    box.innerHTML = buildPreview();
  });
  form.querySelectorAll('input[name], select[name]').forEach(function (el) {
    el.addEventListener('input', function () { clearFieldError(el.name); refreshPreview(); });
    el.addEventListener('change', function () { clearFieldError(el.name); refreshPreview(); });
  });

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
      if (data.client.vat) F('vat').value = data.client.vat;
      if (data.client.address) F('address').value = data.client.address;
      if (data.client.representative) F('representative').value = data.client.representative;
      if (data.client.position) {
        if (data.client.position === 'Direktorius (-ė)') {
          document.getElementById('position-select').value = 'Direktorius (-ė)';
        } else {
          document.getElementById('position-select').value = 'Kita';
          document.getElementById('position-other').value = data.client.position;
          document.getElementById('position-other-wrap').classList.remove('hidden');
        }
        syncPosition();
      }
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

  function showDone(number, url) {
    sessionStorage.removeItem('2uno-sign');
    document.getElementById('form-area').style.display = 'none';
    document.getElementById('qes').hidden = true;
    document.getElementById('doneText').textContent = 'Sutartis su ' + data.providerName + ' pasirašyta ir saugiai išsaugota.';
    document.getElementById('doneNumber').textContent = number;
    document.getElementById('doneLink').href = url;
    document.getElementById('done').classList.add('show');
    window.scrollTo(0, 0);
  }

  // Kvalifikuotas parašas: Dokobit langas puslapyje, o būsena tikrinama kas 3 s (iki 20 min.).
  function startQes(d) {
    document.getElementById('form-area').style.display = 'none';
    document.getElementById('qes').hidden = false;
    document.getElementById('qesFrame').src = d.signUrl;
    window.scrollTo(0, 0);
    var tries = 0;
    (function poll() {
      fetch('/api/sign/status?t=' + encodeURIComponent(d.statusToken), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (s) {
          if (s.signed) return showDone(s.number, s.downloadUrl);
          if (++tries > 400) { msg(document.getElementById('qesMsg'), 'bad', 'Parašo laukimo laikas baigėsi. Pradėkite iš naujo.'); return; }
          setTimeout(poll, 3000);
        })
        .catch(function () { setTimeout(poll, 5000); });
    })();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateSignFields()) {
      var firstInvalid = form.querySelector('.invalid');
      if (firstInvalid) firstInvalid.focus();
      return;
    }
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
        if (x.d.signUrl) { startQes(x.d); return; }
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
