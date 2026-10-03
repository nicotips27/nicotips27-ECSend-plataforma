import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(ROOT, '.upstream', 'index.html'), 'utf8');

const cfg = html.match(/tailwind\.config[\s\S]{0,600}?\n\s*\}/);
console.log('=== tailwind.config (raw) ===');
console.log(cfg ? cfg[0] : 'NO ENCONTRADO');

console.log('\n=== scripts en orden ===');
for (const m of html.matchAll(/<script[^>]*src="[^"]+"[^>]*>/g)) console.log('  ' + m[0]);

console.log('\n=== <link> ===');
for (const m of html.matchAll(/<link[^>]*>/g)) console.log('  ' + m[0]);

console.log('\n=== CSP actual ===');
console.log(html.match(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/)?.[0] ?? 'NO HAY');

console.log('\n=== service worker en app.js ===');
const js = await readFile(path.join(ROOT, '.upstream', 'js', 'app.js'), 'utf8');
for (const m of js.matchAll(/serviceWorker[\s\S]{0,220}/g)) console.log('  ...' + m[0].replace(/\s+/g, ' '));

console.log('\n=== showDirectoryPicker (3 usos) ===');
for (const m of js.matchAll(/[\s\S]{0,90}showDirectoryPicker[\s\S]{0,140}/g)) {
  console.log('  ---');
  console.log('  ' + m[0].replace(/\s+/g, ' ').trim());
}

console.log('\n=== clientes CDN referenciados desde app.js ===');
for (const m of new Set(js.match(/https:\/\/[a-z0-9.\-]+\/[^'"`\s)]*/gi) ?? [])) console.log('  ' + m);