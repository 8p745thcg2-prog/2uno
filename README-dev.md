# 2uno.lt – kūrimo aplinka

Šaka `dev` → testinė aplinka (Cloudflare Pages Preview). Šaka `main` → 2uno.lt.

## Struktūra

- `functions/_middleware.js` – saugumo antraštės, testinės aplinkos slaptažodis, uždaryti vidiniai keliai.
- `functions/_lib/crypto.js` – vokų šifravimas (AES-256-GCM), atsitiktiniai ID.
- `functions/api/health.js` – `/api/health`: D1, R2 ir šifravimo patikra.
- `db/schema.sql` – D1 schema.
- `test/` – testai (`node test/crypto.test.mjs`, `node test/middleware.test.mjs`).

## Cloudflare Pages nustatymai (Preview aplinka)

| Tipas | Pavadinimas | Reikšmė |
| --- | --- | --- |
| Kintamasis | `APP_ENV` | `test` (Production: `production`) |
| Paslaptis | `TEST_ACCESS_PASSWORD` | testinės aplinkos slaptažodis |
| Paslaptis | `MASTER_KEY` | 32 atsitiktiniai baitai base64url (atskiras kiekvienai aplinkai) |
| D1 | `DB` | `2uno-dev` |
| R2 | `CONTRACTS` | `2uno-dev-contracts` (ES jurisdikcija) |

`MASTER_KEY` sugeneruoti naršyklės konsolėje:

```js
btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
```

Raktas niekur nesaugomas, išskyrus Cloudflare Secrets. Jį praradus, užšifruotų duomenų atkurti neįmanoma.
