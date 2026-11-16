(function () {
  var $ = function (id) { return document.getElementById(id); };
  var STATUSES = {
    laukia_apmokejimo: 'Laukia apmokėjimo', apmoketa: 'Apmokėta', pasirasyta: 'Pasirašyta',
    pasibaige_terminas: 'Pasibaigė terminas', partneris_atsisake: 'Įmonė atsisakė', grazinta: 'Grąžinta',
    atsaukta: 'Atšaukta', uzdaryta: 'Uždaryta',
  };
  var email = '';
  var currentReq = null, currentPart = null, partners = [];

  function tsToken(form) { var i = form.querySelector('[name="cf-turnstile-response"]'); return i ? i.value : ''; }
  function tsReset(form) { var w = form.querySelector('.cf-turnstile'); if (window.turnstile && w) try { window.turnstile.reset(w); } catch (e) {} }
  function msg(el, kind, text) { el.className = 'msg ' + kind; el.textContent = text; }
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(path, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }
  function el(tag, attrs, text) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  function when(iso) { return iso ? new Date(iso).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' }) : '–'; }
  function eur(n) { return n == null ? '–' : Number(n).toFixed(2).replace('.', ',') + ' €'; }
  function badge(s, label) { var c = s === 'laukia_apmokejimo' ? 'wait' : (s === 'apmoketa' || s === 'pasirasyta') ? 'open' : 'off'; return el('span', { class: 'badge ' + c }, label); }
  function row(dl, k, v) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v || '–')); }
  function show(view) { ['loginView', 'setupView', 'totpView', 'appView'].forEach(function (v) { $(v).hidden = v !== view; }); $('who').hidden = view === 'loginView'; }

  // ---------- Prisijungimas ----------
  $('emailForm').addEventListener('submit', function (e) {
    e.preventDefault();
    email = $('emailForm').elements.email.value.trim();
    $('sendBtn').disabled = true;
    api('/api/admin/login', { method: 'POST', body: { email: email, turnstile: tsToken($('emailForm')) } }).then(function (d) {
      tsReset($('emailForm'));
      if (d._status !== 200) { msg($('loginMsg'), 'bad', d.error || 'Klaida'); return; }
      msg($('loginMsg'), 'ok', d.message + (d.devCode ? ' (Paštas neveikia, testinis kodas: ' + d.devCode + ')' : ''));
      $('codeForm').hidden = false; $('codeForm').elements.code.focus();
    }).finally(function () { $('sendBtn').disabled = false; });
  });

  $('codeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('verifyBtn').disabled = true;
    api('/api/admin/verify', { method: 'POST', body: { email: email, code: $('codeForm').elements.code.value.trim() } }).then(function (d) {
      if (d._status !== 200) { msg($('loginMsg'), 'bad', d.error || 'Klaida'); return; }
      init();
    }).finally(function () { $('verifyBtn').disabled = false; });
  });

  function startSetup() {
    show('setupView');
    api('/api/admin/totp-setup', { method: 'POST' }).then(function (d) {
      if (d._status !== 200) { msg($('setupMsg'), 'bad', d.error || 'Klaida'); return; }
      $('secret').textContent = d.secret.replace(/(.{4})/g, '$1 ').trim();
      $('otpLink').href = d.uri;
    });
  }

  function totpSubmit(form, out) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = form.querySelector('button'); b.disabled = true;
      api('/api/admin/totp-verify', { method: 'POST', body: { code: form.elements.code.value.trim() } }).then(function (d) {
        if (d._status !== 200) { msg(out, 'bad', d.error || 'Klaida'); form.elements.code.value = ''; return; }
        $('secret').textContent = '';
        init();
      }).finally(function () { b.disabled = false; });
    });
  }
  totpSubmit($('setupForm'), $('setupMsg'));
  totpSubmit($('totpForm'), $('totpMsg'));

  $('logout').addEventListener('click', function () { api('/api/admin/logout', { method: 'POST' }).then(function () { location.reload(); }); });

  // ---------- Skirtukai ----------
  function tab(which) {
    $('tabReq').className = which === 'req' ? 'on' : ''; $('tabPart').className = which === 'part' ? 'on' : '';
    $('reqPane').hidden = which !== 'req'; $('partPane').hidden = which !== 'part';
    if (which === 'req') loadRequests(); else loadPartners();
  }
  $('tabReq').addEventListener('click', function () { tab('req'); });
  $('tabPart').addEventListener('click', function () { tab('part'); });
  Object.keys(STATUSES).forEach(function (k) { $('fStatus').appendChild(el('option', { value: k }, STATUSES[k])); });
  $('fStatus').addEventListener('change', loadRequests);
  $('fPartner').addEventListener('change', loadRequests);

  // ---------- Užklausos ----------
  function loadRequests() {
    var q = '?status=' + encodeURIComponent($('fStatus').value) + '&partner=' + encodeURIComponent($('fPartner').value);
    api('/api/admin/requests' + q).then(function (d) {
      if (d._status === 401) return init();
      var tb = $('reqRows'); tb.textContent = '';
      if (!d.requests.length) { var tr0 = el('tr'); var td0 = el('td', { colspan: '4', class: 'empty' }, 'Užklausų nėra.'); tr0.appendChild(td0); tb.appendChild(tr0); return; }
      d.requests.forEach(function (r) {
        var tr = el('tr', { class: 'row' + (currentReq === r.id ? ' active' : '') });
        tr.appendChild(el('td', null, r.number || r.id.slice(0, 8)));
        tr.appendChild(el('td', null, r.partnerName || '–'));
        var tdS = el('td'); tdS.appendChild(badge(r.status, r.statusLabel)); tr.appendChild(tdS);
        tr.appendChild(el('td', null, r.status === 'laukia_apmokejimo' ? when(r.deadlineAt) : '–'));
        tr.addEventListener('click', function () { currentReq = r.id; loadRequests(); loadRequest(r.id); });
        tb.appendChild(tr);
      });
    });
  }

  function loadRequest(id) {
    api('/api/admin/requests/' + encodeURIComponent(id)).then(function (r) {
      var box = $('reqDetail'); box.textContent = '';
      if (r._status !== 200) { box.appendChild(el('p', { class: 'empty' }, r.error || 'Klaida')); return; }
      box.appendChild(el('h2', null, r.summary.number || 'Užklausa'));
      box.appendChild(badge(r.status, r.statusLabel));
      var dl = el('dl'); box.appendChild(dl);
      row(dl, 'Buhalterinė įmonė', r.partnerName);
      row(dl, 'Kaina', eur(r.priceEur) + ' per mėn.');
      row(dl, 'Gauta', when(r.createdAt));
      row(dl, 'Atsakymo terminas', when(r.deadlineAt));
      row(dl, 'Priminimas išsiųstas', when(r.reminderSentAt));
      row(dl, 'Forma / darbuotojai', [r.summary.legalForm, r.summary.employees].filter(Boolean).join(' · '));
      row(dl, 'Situacija', r.summary.situation);
      if (r.client) {
        box.appendChild(el('h3', null, 'Klientas'));
        var c = el('dl'); box.appendChild(c);
        row(c, 'Įmonė', r.client.name); row(c, 'Kodas', r.client.code); row(c, 'PVM kodas', r.client.vat);
        row(c, 'Adresas', r.client.address);
        row(c, 'Atstovas', [r.client.representative, r.client.position].filter(Boolean).join(', '));
        row(c, 'El. paštas', r.client.email); row(c, 'Telefonas', r.client.phone);
      }
      box.appendChild(el('h3', null, 'Sutartis ir mokėjimai'));
      var s = el('dl'); box.appendChild(s);
      row(s, 'Klientas pasirašė', when(r.contract.clientSignedAt));
      row(s, 'Įmonė pasirašė', when(r.contract.partnerSignedAt));
      row(s, 'Bus ištrinta', r.contract.deletedAt ? 'Ištrinta ' + when(r.contract.deletedAt) : when(r.contract.deleteAfter));
      row(s, 'Mokėjimai', r.payments.length ? r.payments.map(function (p) { return eur(p.amountEur) + ' · ' + p.status + ' · ' + when(p.paidAt); }).join('; ') : 'Nėra');
      box.appendChild(el('h3', null, 'Įvykiai'));
      var log = el('div', { class: 'log' }); box.appendChild(log);
      r.log.forEach(function (x) { log.appendChild(el('div', null, when(x.at) + ' · ' + x.action)); });
    });
  }

  // ---------- Įmonės ----------
  function loadPartners(selectId) {
    api('/api/admin/partners').then(function (d) {
      if (d._status === 401) return init();
      partners = d.partners;
      var sel = $('fPartner'); var keep = sel.value; sel.textContent = '';
      sel.appendChild(el('option', { value: '' }, 'Visos įmonės'));
      partners.forEach(function (p) { sel.appendChild(el('option', { value: p.id }, p.name)); });
      sel.value = keep;
      var tb = $('partRows'); tb.textContent = '';
      partners.forEach(function (p) {
        var tr = el('tr', { class: 'row' + (currentPart === p.id ? ' active' : '') });
        tr.appendChild(el('td', null, p.name));
        tr.appendChild(el('td', null, p.active ? 'Taip' : 'Ne'));
        tr.appendChild(el('td', null, String(p.waiting)));
        tr.appendChild(el('td', null, String(p.won)));
        var late = el('td', null, String(p.late30)); if (p.late30 >= 3) late.className = 'warnl'; tr.appendChild(late);
        tr.addEventListener('click', function () { currentPart = p.id; loadPartners(); editPartner(p); });
        tb.appendChild(tr);
      });
      if (selectId) { currentPart = selectId; var f = partners.filter(function (x) { return x.id === selectId; })[0]; if (f) editPartner(f); loadPartners(); }
    });
  }

  function field(form, label, name, value, hint) {
    var l = el('label', null, label); var i = el('input', { name: name }); i.value = value || ''; l.appendChild(i);
    if (hint) l.appendChild(el('small', { style: 'display:block;color:var(--muted);font-weight:400;margin-top:4px' }, hint));
    form.appendChild(l); return i;
  }

  function editPartner(p) {
    var box = $('partDetail'); box.textContent = '';
    box.appendChild(el('h2', null, p ? p.name : 'Nauja įmonė'));
    if (p && p.late30 >= 3) box.appendChild(el('div', { class: 'msg warn' }, 'Per 30 dienų praleisti ' + p.late30 + ' terminai. Pagal sutarties 6.4 p. galima laikinai sustabdyti rodymą, iš anksto informavus įmonę.'));
    var f = el('form'); box.appendChild(f);
    field(f, 'Pavadinimas', 'name', p && p.name, 'Pvz. UAB „Apskaitos namai“');
    field(f, 'Įmonės kodas', 'companyCode', p && p.companyCode);
    field(f, 'El. paštai pranešimams', 'notifyEmails', p && p.notifyEmails.join(', '), 'Kur siųsti „Naujas klientas“ ir priminimus. Keli – per kablelį.');
    field(f, 'Prisijungiantys darbuotojai', 'userEmails', p && p.users.map(function (u) { return u.email; }).join(', '), 'Šiais adresais bus galima prisijungti prie įmonės portalo.');
    var chk = el('label', { class: 'check' }); var cb = el('input', { type: 'checkbox', name: 'active' }); cb.checked = p ? p.active : false; chk.appendChild(cb); chk.appendChild(document.createTextNode('Rodyti klientams palyginime')); f.appendChild(chk);
    var b = el('button', { class: 'full' }, p ? 'Išsaugoti' : 'Sukurti'); f.appendChild(b);
    var out = el('div', { class: 'msg' }); box.appendChild(out);
    if (p && p.users.length) {
      box.appendChild(el('h3', null, 'Paskutiniai prisijungimai'));
      var log = el('div', { class: 'log' }); box.appendChild(log);
      p.users.forEach(function (u) {
        var line = el('div', null, u.email + ' · ' + (u.lastLoginAt ? when(u.lastLoginAt) : 'dar nesijungė') + (u.locked ? ' · UŽRAKINTA' : ''));
        if (u.locked) {
          var ub = el('button', { type: 'button', class: 'light', style: 'margin-left:8px;padding:4px 10px;font-size:12px' }, 'Atrakinti');
          ub.addEventListener('click', function () {
            ub.disabled = true;
            api('/api/admin/partners/' + encodeURIComponent(p.id) + '/unlock', { method: 'POST', body: { email: u.email } }).then(function (d) {
              if (d._status !== 200) { msg(out, 'bad', d.error || 'Klaida'); ub.disabled = false; return; }
              msg(out, 'ok', u.email + ' atrakinta.'); loadPartners(p.id);
            });
          });
          line.appendChild(ub);
        }
        log.appendChild(line);
      });
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault(); b.disabled = true;
      var body = { name: f.elements.name.value, companyCode: f.elements.companyCode.value, notifyEmails: f.elements.notifyEmails.value, userEmails: f.elements.userEmails.value, active: f.elements.active.checked };
      api(p ? '/api/admin/partners/' + encodeURIComponent(p.id) : '/api/admin/partners', { method: 'POST', body: body }).then(function (d) {
        if (d._status !== 200 && d._status !== 201) {
          var fields = d.fields ? Object.keys(d.fields).map(function (k) { return d.fields[k]; }).join('. ') : '';
          msg(out, 'bad', (d.error || 'Klaida') + (fields ? ': ' + fields : '')); return;
        }
        msg(out, d.warning ? 'warn' : 'ok', d.warning || 'Išsaugota.');
        loadPartners(p ? p.id : d.id);
      }).finally(function () { b.disabled = false; });
    });
  }
  $('newPartner').addEventListener('click', function () { currentPart = null; loadPartners(); editPartner(null); });

  // ---------- Pradžia ----------
  function init() {
    api('/api/admin/me').then(function (me) {
      if (me._status !== 200) return show('loginView');
      $('whoName').textContent = me.email;
      if (!me.mfaOk) return me.hasTotp ? show('totpView') : startSetup();
      show('appView'); loadPartners(); tab('req');
    });
  }
  init();
})();
