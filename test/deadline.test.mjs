// Atsakymo terminas pagal sutarties 6.1 ir 2.5 p.
import assert from 'node:assert/strict';
import { responseDeadline, isHoliday } from '../functions/_lib/deadline.js';

const v = (iso) => new Date(iso); // ISO su laiko juosta
// Ketvirtadienis 14:00 (žiema, UTC+2) → penktadienis 17:00 = 15:00 UTC
assert.equal(responseDeadline(v('2026-11-12T14:00:00+02:00')), '2026-11-13T15:00:00.000Z');
// Ketvirtadienis 21:00 → laikoma gauta penktadienį 9:00 → pirmadienis 17:00
assert.equal(responseDeadline(v('2026-11-12T21:00:00+02:00')), '2026-11-16T15:00:00.000Z');
// Ketvirtadienis lygiai 17:00 → jau po darbo laiko
assert.equal(responseDeadline(v('2026-11-12T17:00:00+02:00')), '2026-11-16T15:00:00.000Z');
// Šeštadienis → gauta pirmadienį → antradienis 17:00
assert.equal(responseDeadline(v('2026-11-14T10:00:00+02:00')), '2026-11-17T15:00:00.000Z');
// Vasara (UTC+3): trečiadienis 10:00 → ketvirtadienis 17:00 = 14:00 UTC
assert.equal(responseDeadline(v('2026-06-10T10:00:00+03:00')), '2026-06-11T14:00:00.000Z');
// Šventės: gruodžio 23 d. (trečiadienis) 10:00 → 24, 25, 26 – šventės, 27 sekmadienis → gruodžio 28 d. 17:00
assert.equal(responseDeadline(v('2026-12-23T10:00:00+02:00')), '2026-12-28T15:00:00.000Z');
// Velykų pirmadienis 2027-03-29: penktadienis 03-26 10:00 → pirmadienis šventė → antradienis 03-30 17:00 (vasaros laikas nuo 03-28)
assert.equal(responseDeadline(v('2027-03-26T10:00:00+02:00')), '2027-03-30T14:00:00.000Z');
assert.equal(isHoliday({ y: 2026, m: 4, d: 6 }), true); // 2026 m. Velykų pirmadienis
assert.equal(isHoliday({ y: 2026, m: 7, d: 6 }), true);
assert.equal(isHoliday({ y: 2026, m: 7, d: 7 }), false);
// Vietinis 23:30 UTC+2 jau kita diena UTC atžvilgiu: penktadienis 23:30 → pirmadienį gauta → antradienis
assert.equal(responseDeadline(v('2026-11-13T23:30:00+02:00')), '2026-11-17T15:00:00.000Z');
console.log('Visi termino testai praėjo');
