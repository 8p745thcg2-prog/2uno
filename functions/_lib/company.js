// Įmonės duomenų paieška pagal kodą iš nemokamų oficialių šaltinių:
//  - Registrų centro atviri duomenys (get.data.gov.lt): pavadinimas, forma, registracijos/išregistravimo data;
//  - ES VIES (tik PVM mokėtojams): pavadinimas ir adresas.
// Duomenys atnaujinami kartą per dieną, todėl ką tik įregistruotų įmonių gali nebūti – tada pildoma ranka.

const JAR = 'https://get.data.gov.lt/datasets/gov/rc/jar';
const VIES = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/LT/vat/';
const TIMEOUT_MS = 6000;

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' }, cf: { cacheTtl: 3600 } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function isValidCompanyCode(code) {
  return /^\d{9}$/.test(String(code || ''));
}

export function isValidVatCode(vat) {
  return /^(LT)?(\d{9}|\d{12})$/i.test(String(vat || '').replace(/\s/g, ''));
}

// Lietuviška teisinės formos santrumpa pavadinimo priekyje (UAB „X“).
const SHORT_FORMS = {
  310: 'UAB', 320: 'AB', 960: 'MB', 810: 'IĮ', 570: 'VšĮ', 210: 'TŪB', 220: 'KŪB', 410: 'ŽŪB', 710: 'KB', 630: 'Asociacija',
};

export async function lookupCompany(code, vat) {
  const result = { found: false, source: [], code: String(code) };

  if (isValidCompanyCode(code)) {
    const data = await getJson(`${JAR}/iregistruoti/JuridinisAsmuo?ja_kodas=${code}`);
    const list = data && Array.isArray(data._data) ? data._data : Array.isArray(data) ? data : [];
    const rec = list.find((x) => String(x.ja_kodas) === String(code)) || null;
    if (rec) {
      result.found = true;
      result.source.push('Registrų centras');
      result.name = rec.ja_pavadinimas || '';
      result.registeredAt = rec.reg_data || null;
      result.deregisteredAt = rec.isreg_data || null;
      result.active = !rec.isreg_data;
      if (rec.pilnas_adresas) result.address = rec.pilnas_adresas;
      if (rec.forma && rec.forma._id) {
        const forma = await getJson(`${JAR}/formos_statusai/Forma/${encodeURIComponent(rec.forma._id)}`);
        if (forma) {
          result.legalForm = forma.pavadinimas || forma.pav_ilgas || '';
          result.legalFormCode = forma.kodas || null;
          result.legalFormShort = SHORT_FORMS[forma.kodas] || '';
        }
      }
    }
  }

  const vatDigits = String(vat || '').replace(/\s/g, '').replace(/^LT/i, '');
  if (vatDigits && isValidVatCode(vatDigits)) {
    const v = await getJson(VIES + vatDigits);
    if (v && v.isValid) {
      result.vatValid = true;
      result.vatCode = 'LT' + vatDigits;
      result.source.push('VIES');
      const real = (x) => x && !['---', 'N/A', 'n/a', '-'].includes(String(x).trim());
      if (!result.name && real(v.name)) result.name = v.name;
      if (real(v.address)) result.address = v.address.replace(/,?\s*\n\s*/g, ', ').trim();
      result.found = true;
    } else if (v) {
      result.vatValid = false;
    }
  }

  return result;
}
