import { writeFile, mkdir, stat } from 'node:fs/promises';
import { createWriteStream, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'src', 'renderer', 'vendor');

/**
 * Versiones fijas. Mismas que usa el sitio web, para que el port sea un fork
 * fiel y no haya que revalidar el comportamiento de la app.
 */
const LIBS = [
  { file: 'lucide.min.js', url: 'https://unpkg.com/lucide@0.462.0/dist/umd/lucide.min.js' },
  { file: 'html5-qrcode.min.js', url: 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js' },
  { file: 'peerjs.min.js', url: 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js' },
  { file: 'qrious.min.js', url: 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js' },
  {
    file: 'tsparticles.slim.bundle.min.js',
    url: 'https://cdn.jsdelivr.net/npm/tsparticles-slim@2.0.6/tsparticles.slim.bundle.min.js'
  }
];

const MIN_KB = 5;

/**
 * El sitio importa Inter desde Google Fonts. Para que la app funcione sin
 * internet hay que bajar los woff2. Inter es una variable font y Google
 * devuelve 7 subsets por peso; solo hace falta 'latin' (el español accented
 * cae aca, no en latin-ext).
 */
const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FONT_WEIGHTS = ['400', '500', '600', '700', '800'];
const FONT_DIR = path.join(VENDOR, 'fonts');

async function fetchLib({ file, url }) {
  const target = path.join(VENDOR, file);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_KB * 1024) throw new Error(`respuesta sospechamente chica: ${buf.length} bytes`);
  await writeFile(target, buf);
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  return { file, kb: buf.length / 1024, sha };
}

async function vendorFonts() {
  const res = await fetch(FONT_CSS, { headers: { 'User-Agent': CHROME_UA } });
  if (!res.ok) throw new Error(`Google Fonts -> HTTP ${res.status}`);
  const css = await res.text();

  // Cada bloque @font-face va precedido por un comentario con el nombre del
  // subset: /* latin */. Nos quedamos con ese y descartamos el resto.
  const blocks = css.split('/*').slice(1);
  const latin = blocks.filter((b) => b.trimStart().startsWith('latin *'));
  if (latin.length === 0) throw new Error('no se encontro el subset latin en la respuesta de Google Fonts');

  await mkdir(FONT_DIR, { recursive: true });

  const rules = [];
  for (const block of latin) {
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (!weight || !url) continue;
    if (!FONT_WEIGHTS.includes(weight)) continue;

    const name = `inter-${weight}.woff2`;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    if (buf.length < 4 * 1024) throw new Error(`${name} sospechosamente chica: ${buf.length} bytes`);
    await writeFile(path.join(FONT_DIR, name), buf);

    rules.push(
      [
        '@font-face {',
        `  font-family: 'Inter';`,
        `  font-style: normal;`,
        `  font-weight: ${weight};`,
        `  font-display: swap;`,
        `  src: url('${name}') format('woff2');`,
        `  unicode-range: ${range.trim()};`,
        '}'
      ].join('\n')
    );
    console.log(`  fonts/${name.padEnd(20)} ${(buf.length / 1024).toFixed(1)} KB`);
  }

  if (rules.length !== FONT_WEIGHTS.length) {
    throw new Error(`esperaba ${FONT_WEIGHTS.length} pesos, obtuve ${rules.length}`);
  }

  await writeFile(
    path.join(FONT_DIR, 'inter.css'),
    `/* Inter latin vendorizado por tools/sync-vendor.mjs - origen: ${FONT_CSS} */\n\n${rules.join('\n\n')}\n`
  );
  console.log(`  fonts/inter.css        ${rules.length} pesos`);
  return rules.length;
}

async function main() {
  await mkdir(VENDOR, { recursive: true });
  const manifest = {};
  let failed = 0;

  for (const lib of LIBS) {
    process.stdout.write(`${lib.file.padEnd(34)} `);
    try {
      const info = await fetchLib(lib);
      manifest[lib.file] = { url: lib.url, bytes: Math.round(info.kb * 1024), sha256: info.sha };
      console.log(`${info.kb.toFixed(1)} KB  ${info.sha}`);
    } catch (err) {
      failed++;
      console.log(`FALLO: ${err.message}`);
    }
  }

  if (failed) {
    console.error(`\n${failed} libreria(s) fallaron. La app no va a funcionar offline.`);
    process.exit(1);
  }

  const lines = ['/* vendorizado automaticamente por tools/sync-vendor.mjs */', ''];
  for (const [file, meta] of Object.entries(manifest)) {
    lines.push(`  ${file.padEnd(34)} ${String(meta.bytes).padStart(9)} B  sha256:${meta.sha}  ${meta.url}`);
  }
  await writeFile(path.join(VENDOR, 'MANIFEST.txt'), `${lines.join('\n')}\n`);
  console.log(`\nOK ${LIBS.length} librerias -> src/renderer/vendor/MANIFEST.txt`);

  console.log('\nFuentes:');
  const weights = await vendorFonts();

  console.log(
    '\nNota: Trystero se sigue importando desde cdn.jsdelivr.net porque sus relays nostr\n' +
      'son remotos: el descubrimiento en red requiere internet por diseno (ver\n' +
      'ARCHITECTURE.md seccion 12 del sitio). El CSP permite ese origen.'
  );
  console.log(`\nListo. ${LIBS.length} librerias + ${weights} pesos de Inter.`);
}

main().catch((err) => {
  console.error('sync-vendor fallo:', err && err.stack ? err.stack : err);
  process.exit(1);
});