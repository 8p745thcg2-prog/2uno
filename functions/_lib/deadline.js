// Atsakymo termino skaičiavimas pagal partnerystės sutartį:
//  2.5 p. – darbo diena: pirmadienis–penktadienis, išskyrus LR švenčių dienas; terminai – Lietuvos laiku.
//  6.1 p. – 1 darbo dienos terminas baigiasi kitos darbo dienos 17.00 val.; pranešimas, gautas po 17.00 val.
//           arba ne darbo dieną, laikomas gautu artimiausią darbo dieną 9.00 val.

const TZ = 'Europe/Vilnius';
const END_HOUR = 17;

// Fiksuotos LR švenčių dienos (Darbo kodekso 123 str.), MM-DD.
const FIXED = ['01-01', '02-16', '03-11', '05-01', '06-24', '07-06', '08-15', '11-01', '11-02', '12-24', '12-25', '12-26'];

// Velykų sekmadienis (Grigaliaus kalendorius, anoniminis algoritmas).
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const pad = (n) => String(n).padStart(2, '0');

// Kalendorinė data { y, m, d } (be laiko juostos).
function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function isHoliday({ y, m, d }) {
  if (FIXED.includes(`${pad(m)}-${pad(d)}`)) return true;
  const e = easterSunday(y);
  const easterMonday = addDays({ y, m: e.month, d: e.day }, 1);
  return easterMonday.m === m && easterMonday.d === d;
}

export function isBusinessDay(date) {
  const wd = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !isHoliday(date);
}

function nextBusinessDay(date) {
  let x = addDays(date, 1);
  while (!isBusinessDay(x)) x = addDays(x, 1);
  return x;
}

// Momento vietinis laikas Vilniuje.
function vilniusParts(instant) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour, minute: +p.minute };
}

// Vilniaus vietinis laikas → UTC momentas (atsižvelgiant į vasaros/žiemos laiką).
function fromVilnius({ y, m, d }, hour) {
  let guess = Date.UTC(y, m - 1, d, hour) - 2 * 3600e3;
  for (let i = 0; i < 2; i++) {
    const p = vilniusParts(new Date(guess));
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - Date.UTC(y, m - 1, d, hour);
    guess -= diff;
  }
  return new Date(guess);
}

// Grąžina termino pabaigą (ISO, UTC) pranešimui, gautam momentu `received`.
export function responseDeadline(received = new Date()) {
  const p = vilniusParts(received);
  let day = { y: p.y, m: p.m, d: p.d };
  // Gautas po 17.00 val. arba ne darbo dieną – laikomas gautu artimiausią darbo dieną 9.00 val.
  if (!isBusinessDay(day) || p.hour >= END_HOUR) day = nextBusinessDay(day);
  return fromVilnius(nextBusinessDay(day), END_HOUR).toISOString();
}
