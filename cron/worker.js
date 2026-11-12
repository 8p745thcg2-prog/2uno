// Suplanuota užduotis (Cloudflare Worker su cron): kas valandą paprašo 2uno svetainės išsiųsti termino priminimus.
// Kintamieji: TARGET_URL (pvz. https://dev.2uno.pages.dev), slaptas CRON_SECRET (tas pats kaip svetainėje).
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
};

async function run(env) {
  const r = await fetch(`${env.TARGET_URL}/api/cron/reminders`, {
    method: 'POST',
    headers: { 'X-Cron-Key': env.CRON_SECRET, 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log('priminimai', r.status, await r.text());
}
