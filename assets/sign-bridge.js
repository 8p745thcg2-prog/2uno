// Testinė jungtis: pagrindinio puslapio mygtukas „Pasirašyti“ veda į pasirašymo puslapį
// su pasirinktu partneriu, kaina ir apimtimis. (Įterpiama tik testinėje aplinkoje.)
(function () {
  function txt(id) { var el = document.getElementById(id); if (!el) return ''; return el.tagName === 'SELECT' && el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : el.value; }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  var btn = document.getElementById('sign');
  if (!btn) return;
  btn.onclick = function () {
    try {
      var data = {
        providerIndex: selected,
        providerName: providers[selected].name,
        priceEur: estimate(selected),
        summary: {
          legalForm: val('type'), vat: txt('vat'), industry: txt('industry'), situation: txt('situation'),
          employees: val('employees'), invoices: String((Number(val('purchases')) || 0) + (Number(val('sales')) || 0)) + ' per mėn.',
          startDate: val('startdate') || val('service-start'),
        },
        client: { name: val('companyname'), code: val('companycode'), representative: val('representative') },
      };
      sessionStorage.setItem('2uno-sign', JSON.stringify(data));
      location.href = '/pasirasymas';
    } catch (e) {
      location.href = '/pasirasymas';
    }
  };
})();
