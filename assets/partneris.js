(function () {
  var $ = function (id) { return document.getElementById(id); };
  var emailForm = $('emailForm'), codeForm = $('codeForm');
  var currentEmail = '';
  var current = null;

  function msg(el, kind, text) { el.className = 'msg ' + kind; el.textContent = text; }
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(path, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }
  function eur(n) { return n == null ? '–' : Number(n).toFixed(2).replace('.', ',') + ' €'; }
  function when(iso) { return iso ? new Date(iso).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' }) : '–'; }
  function badgeClass(s) { return s === 'laukia_apmokejimo' ? 'wait' : (s === 'apmoketa' || s === 'pasirasyta') ? 'open' : 'off'; }
  function el(tag, attrs, text) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }

  function showLogin() { $('loginView').hidden = false; $('appView').hidden = true; $('who').hidden = true; }
  function showApp(me) { $('loginView').hidden = true; $('appView').hidden = false; $('who').hidden = false; $('whoName').textContent = me.partnerName + ' · ' + me.email; loadList(); }

  emailForm.addEventListener('submit', function (e) {
    e.preventDefault();
    currentEmail = emailForm.elements.email.value.trim();
    $('sendBtn').disabled = true;
    api('/api/partner/login', { method: 'POST', body: { email: currentEmail } }).then(function (d) {
      if (d._status !== 200) { msg($('loginMsg'), 'bad', d.error || 'Klaida'); return; }
      msg($('loginMsg'), 'ok', d.message + (d.devCode ? ' (Testinė aplinka – el. laiškai dar nesiunčiami, jūsų kodas: ' + d.devCode + ')' : ''));
      codeForm.hidden = false; codeForm.elements.code.focus();
    }).finally(function () { $('sendBtn').disabled = false; });
  });

  codeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    $('verifyBtn').disabled = true;
    api('/api/partner/verify', { method: 'POST', body: { email: currentEmail, code: codeForm.elements.code.value.trim() } }).then(function (d) {
      if (d._status !== 200) { msg($('loginMsg'), 'bad', d.error || 'Klaida'); return; }
      init();
    }).finally(function () { $('verifyBtn').disabled = false; });
  });

  $('logout').addEventListener('click', function () { api('/api/partner/logout', { method: 'POST' }).then(function () { location.reload(); }); });

  function seed(email, out) {
    return api('/api/demo/seed', { method: 'POST', body: { email: email } }).then(function (d) {
      if (out) msg(out, d._status === 201 ? 'ok' : 'bad', d._status === 201 ? 'Sukurta demo užklausa el. paštui ' + d.email + '. Dabar gaukite kodą ir prisijunkite.' : (d.error || 'Nepavyko'));
      return d;
    });
  }
  $('seedBtn').addEventListener('click', function () {
    var em = emailForm.elements.email.value.trim();
    if (!em) { msg($('seedMsg'), 'warn', 'Pirmiausia įrašykite el. paštą.'); return; }
    seed(em, $('seedMsg'));
  });
  $('seedBtn2').addEventListener('click', function () { seed($('whoName').textContent.split(' · ')[1]).then(loadList); });

  function loadList() {
    api('/api/partner/requests').then(function (d) {
      if (d._status === 401) return showLogin();
      var list = $('list'); list.textContent = '';
      if (!d.requests || !d.requests.length) { list.appendChild(el('p', { class: 'empty' }, 'Užklausų kol kas nėra.')); return; }
      d.requests.forEach(function (r) {
        var b = el('button', { class: 'item' + (current === r.id ? ' active' : ''), type: 'button' });
        b.appendChild(el('b', null, (r.summary.legalForm || '') + ' · ' + (r.summary.situation || 'Užklausa')));
        b.appendChild(el('small', null, 'Gauta ' + when(r.createdAt) + ' · ' + eur(r.priceEur) + '/mėn.'));
        b.appendChild(el('br'));
        b.appendChild(el('span', { class: 'badge ' + badgeClass(r.status) }, r.statusLabel));
        b.addEventListener('click', function () { current = r.id; loadList(); loadDetail(r.id); });
        list.appendChild(b);
      });
    });
  }

  function row(dl, k, v) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v || '–')); }

  function loadDetail(id) {
    api('/api/partner/requests/' + encodeURIComponent(id)).then(function (r) {
      var box = $('detail'); box.textContent = '';
      if (r._status !== 200) { box.appendChild(el('p', { class: 'empty' }, r.error || 'Klaida')); return; }
      box.appendChild(el('h2', null, r.summary.number || 'Užklausa'));
      box.appendChild(el('span', { class: 'badge ' + badgeClass(r.status) }, r.statusLabel));
      var dl = el('dl'); box.appendChild(dl);
      row(dl, 'Veiklos forma', r.summary.legalForm);
      row(dl, 'Darbuotojai', r.summary.employees);
      row(dl, 'Sąskaitos', r.summary.invoices);
      row(dl, 'Situacija', r.summary.situation);
      row(dl, 'Kaina', eur(r.priceEur) + ' per mėn. be PVM');
      if (r.status === 'laukia_apmokejimo') row(dl, 'Atsakyti iki', when(r.deadlineAt));

      var out = el('div', { class: 'msg' });
      if (r.unlocked && r.client) {
        box.appendChild(el('h3', null, 'Kliento duomenys'));
        var c = el('dl'); box.appendChild(c);
        row(c, 'Įmonė', r.client.name); row(c, 'Įmonės kodas', r.client.code); row(c, 'PVM kodas', r.client.vat);
        row(c, 'Adresas', r.client.address); row(c, 'Atstovas', r.client.representative + ', ' + r.client.position);
        row(c, 'El. paštas', r.client.email); row(c, 'Telefonas', r.client.phone);
        var a = el('div', { class: 'actions' }); box.appendChild(a);
        if (r.hasContract) {
          var dlBtn = el('button', { type: 'button' }, 'Atsisiųsti sutartį (PDF)');
          dlBtn.addEventListener('click', function () {
            dlBtn.disabled = true;
            api('/api/partner/requests/' + encodeURIComponent(id) + '/download-link', { method: 'POST' }).then(function (d) {
              if (d._status !== 200) { msg(out, 'bad', d.error || 'Klaida'); return; }
              location.href = d.url;
            }).finally(function () { dlBtn.disabled = false; });
          });
          a.appendChild(dlBtn);
        }
      } else if (r.status === 'laukia_apmokejimo') {
        box.appendChild(el('div', { class: 'lock' }, 'Kliento pavadinimas, kontaktai ir pasirašyta sutartis atrakinami automatiškai iš karto po komisinio apmokėjimo.'));
        var acts = el('div', { class: 'actions' }); box.appendChild(acts);
        var pay = el('button', { type: 'button' }, 'Apmokėti komisinį (testas)');
        pay.addEventListener('click', function () {
          pay.disabled = true;
          api('/api/partner/requests/' + encodeURIComponent(id) + '/pay-test', { method: 'POST' }).then(function (d) {
            if (d._status !== 200) { msg(out, 'bad', d.error || 'Klaida'); pay.disabled = false; return; }
            loadList(); loadDetail(id);
          });
        });
        var dec = el('button', { type: 'button', class: 'danger' }, 'Atsisakyti kliento');
        dec.addEventListener('click', function () {
          dec.disabled = true;
          api('/api/partner/requests/' + encodeURIComponent(id) + '/decline', { method: 'POST' }).then(function () { loadList(); loadDetail(id); });
        });
        acts.appendChild(pay); acts.appendChild(dec);
      }
      box.appendChild(out);
    });
  }

  function init() {
    api('/api/partner/me').then(function (me) { if (me._status === 200) showApp(me); else showLogin(); });
  }
  init();
})();
