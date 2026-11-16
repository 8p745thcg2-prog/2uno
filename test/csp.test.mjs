// CSP: be 'unsafe-inline' skriptams; kiekvienas įterptinis skriptas puslapiuose turi turėti leidžiamą kontrolinį kodą.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { onRequest, INLINE_SCRIPT_HASHES } from '../functions/_middleware.js';

const root = new URL('../', import.meta.url);
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
let inline = 0;
for (const page of pages) {
  const html = fs.readFileSync(new URL(page, root), 'utf8');
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(m[1])) continue;
    inline++;
    const h = `'sha256-${crypto.createHash('sha256').update(m[2], 'utf8').digest('base64')}'`;
    assert.ok(INLINE_SCRIPT_HASHES.includes(h), `${page}: įterptinis skriptas be leidžiamo kodo ${h} – atnaujinkite INLINE_SCRIPT_HASHES`);
  }
  assert.doesNotMatch(html, /\son(click|load|error|submit|change|input)=/i, `${page}: įterptinis įvykio apdorojimas`);
}
assert.ok(inline >= 6);
const res = await onRequest({ request: new Request('https://t/'), env: { APP_ENV: 'production' }, next: async () => new Response('x', { headers: { 'Content-Type': 'text/html' } }) });
const csp = res.headers.get('Content-Security-Policy');
assert.doesNotMatch(csp.match(/script-src[^;]*/)[0], /unsafe-inline/);
console.log(`CSP testai praėjo (${pages.length} puslapiai, ${inline} įterptiniai skriptai)`);
