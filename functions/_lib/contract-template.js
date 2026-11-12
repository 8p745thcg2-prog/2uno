// DEMONSTRACINIS sutarties šablonas. Tikri partnerių šablonai bus įkeliami vėliau,
// o kintamieji ({{...}}) bus susieti su tais pačiais laukais.
import { PdfDoc } from './pdf.js';

// Demo partneris (išgalvotas).
export const DEMO_PARTNER = {
  name: 'UAB „Demo apskaita“',
  code: '300000000',
  vat: 'LT100000000000',
  address: 'Gedimino pr. 1, LT-01103 Vilnius',
  representative: 'Vardenis Pavardenis',
  position: 'direktorius',
  basis: 'įstatus',
  email: 'info@demo-apskaita.lt',
  phone: '+370 600 00000',
  bank: 'LT00 0000 0000 0000 0000',
};

export const CLIENT_FIELDS = [
  'name', 'code', 'vat', 'address', 'representative', 'position', 'basis', 'email', 'phone', 'bank',
];

export const LIMITS = {
  name: 200, code: 9, vat: 14, address: 250, representative: 120, position: 80, basis: 120, email: 120, phone: 30, bank: 40,
};

// Kliento duomenų patikra serveryje. Grąžina { ok, errors, client }.
export function validateClient(input) {
  const errors = {};
  const c = {};
  for (const f of CLIENT_FIELDS) {
    const v = String((input && input[f]) ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (v.length > LIMITS[f]) errors[f] = 'Per ilga reikšmė';
    c[f] = v;
  }
  for (const f of ['name', 'code', 'address', 'representative', 'position', 'email']) if (!c[f]) errors[f] = 'Privalomas laukas';
  if (c.code && !/^\d{9}$/.test(c.code)) errors.code = 'Įmonės kodą sudaro 9 skaitmenys';
  if (c.vat && !/^(LT)?(\d{9}|\d{12})$/i.test(c.vat.replace(/\s/g, ''))) errors.vat = 'Neteisingas PVM kodas';
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) errors.email = 'Neteisingas el. paštas';
  if (!c.basis) c.basis = 'įstatus';
  return { ok: Object.keys(errors).length === 0, errors, client: c };
}

function ltDate(d) {
  const months = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio'];
  return `${d.getFullYear()} m. ${months[d.getMonth()]} ${d.getDate()} d.`;
}

function partyLine(p) {
  const vat = p.vat ? `, PVM mokėtojo kodas ${p.vat}` : '';
  return `${p.name}, juridinio asmens kodas ${p.code}${vat}, buveinės adresas ${p.address}, kurią atstovauja ${p.position} ${p.representative}, veikiantis (-i) pagal ${p.basis}`;
}

export async function renderDemoContract({ number, date = new Date(), client, partner = DEMO_PARTNER, priceEur = 150, demo = true }) {
  const doc = new PdfDoc({ title: `Apskaitos paslaugų sutartis Nr. ${number}`, footer: `Sutartis Nr. ${number}` });

  if (demo) doc.paragraph('DEMONSTRACINĖ VERSIJA – TEISINĖS GALIOS NETURI', { bold: true, size: 9, align: 'center', spaceAfter: 10 });
  doc.paragraph('APSKAITOS PASLAUGŲ SUTARTIS', { bold: true, size: 14, align: 'center', spaceAfter: 2 });
  doc.paragraph(`Nr. ${number}`, { size: 11, align: 'center', spaceAfter: 2 });
  doc.paragraph(ltDate(date), { size: 11, align: 'center', spaceAfter: 16 });

  doc.paragraph(
    `${partyLine(partner)} (toliau – Paslaugų teikėjas), ir ${partyLine(client)} (toliau – Klientas), toliau kartu vadinamos Šalimis, sudarė šią apskaitos paslaugų sutartį (toliau – Sutartis).`,
    { spaceAfter: 12 }
  );

  const sections = [
    ['SUTARTIES DALYKAS', [
      'Paslaugų teikėjas įsipareigoja tvarkyti Kliento buhalterinę apskaitą, rengti ir teikti mokesčių deklaracijas bei finansines ataskaitas, o Klientas – laiku pateikti apskaitos dokumentus ir sumokėti už paslaugas.',
      'Paslaugų apimtis nustatyta pagal Kliento Platformoje 2uno.lt pateiktus duomenis. Pasikeitus apimtims, kaina perskaičiuojama pagal Sutarties priede nurodytus įkainius.',
    ]],
    ['KAINA IR ATSISKAITYMAS', [
      `Paslaugų kaina – ${priceEur.toFixed(2).replace('.', ',')} Eur per mėnesį be PVM.`,
      'Klientas apmoka Paslaugų teikėjo išrašytą sąskaitą per 10 dienų nuo jos gavimo.',
    ]],
    ['ŠALIŲ ĮSIPAREIGOJIMAI', [
      'Klientas apskaitos dokumentus pateikia ne vėliau kaip iki kito mėnesio 5 dienos.',
      'Paslaugų teikėjas užtikrina Kliento duomenų konfidencialumą ir tvarko asmens duomenis pagal Bendrąjį duomenų apsaugos reglamentą.',
    ]],
    ['BAIGIAMOSIOS NUOSTATOS', [
      'Sutartis įsigalioja, kai ją kvalifikuotais elektroniniais parašais pasirašo abi Šalys, ir galioja neterminuotai.',
      'Kiekviena Šalis gali nutraukti Sutartį, raštu įspėjusi kitą Šalį ne vėliau kaip prieš 30 kalendorinių dienų.',
    ]],
  ];
  sections.forEach(([title, items], i) => {
    doc.paragraph(`${i + 1}. ${title}`, { bold: true, spaceBefore: 6, spaceAfter: 4 });
    items.forEach((t, j) => doc.paragraph(t, { indent: 28, label: `${i + 1}.${j + 1}.` }));
  });

  doc.ensure(240); // rekvizitai ir parašai – viename puslapyje
  doc.paragraph('ŠALIŲ REKVIZITAI IR PARAŠAI', { bold: true, align: 'center', spaceBefore: 14, spaceAfter: 8 });
  const req = (p) => [
    p.name,
    `Juridinio asmens kodas ${p.code}`,
    p.vat ? `PVM mokėtojo kodas ${p.vat}` : 'Ne PVM mokėtojas',
    p.address,
    p.bank ? `A. s. ${p.bank}` : '',
    `El. paštas ${p.email}`,
    p.phone ? `Tel. ${p.phone}` : '',
  ].filter(Boolean);
  const L = req(partner);
  const R = req(client);
  const rows = [{ cells: ['Paslaugų teikėjas', 'Klientas'], bold: true }];
  for (let i = 0; i < Math.max(L.length, R.length); i++) rows.push({ cells: [L[i] || '', R[i] || ''] });
  rows.push({ cells: [cap(partner.position), cap(client.position)], spaceBefore: 18 });
  rows.push({ cells: [partner.representative, client.representative] });
  rows.push({ cells: ['Pasirašyta kvalifikuotu el. parašu', 'Pasirašyta kvalifikuotu el. parašu'], spaceBefore: 6 });
  doc.columns(rows);

  return doc.save();
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
