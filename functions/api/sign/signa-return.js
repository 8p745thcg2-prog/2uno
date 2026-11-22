// GET /api/sign/signa-return – į šį adresą Signa Platform nukreipia kliento naršyklę (iframe)
// pasirašymo pabaigoje (operacija "sign", parametras postbackUrl). Patys būsenos pasikeitimai
// tikrinami kitaip (žr. functions/api/sign/signa.js ir functions/api/sign/status.js) – šis
// puslapis klientui tik parodo, kad galima uždaryti langą; tėvinis puslapis (pasirasymas.html)
// tuo metu jau pats stebi /api/sign/status.
export async function onRequestGet() {
  return new Response(
    '<!doctype html><html lang="lt"><meta charset="utf-8"><body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:60px 20px;color:#10245f"><p>Pasirašymas užbaigtas. Šį langą galite uždaryti.</p></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
