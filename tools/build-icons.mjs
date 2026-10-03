import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createWriteStream, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const TMP = path.join(ROOT, 'vendor-tmp');

const SOURCES = [
  { name: 'logo.png', url: 'https://raw.githubusercontent.com/Estalingradocorp/ECsendpro/main/assets/logo.png' },
  { name: 'icon-512.png', url: 'https://raw.githubusercontent.com/Estalingradocorp/ECsendpro/main/assets/icon-512.png' },
  { name: 'icon-192.png', url: 'https://raw.githubusercontent.com/Estalingradocorp/ECsendpro/main/assets/icon-192.png' }
];

async function download({ name, url }) {
  await mkdir(TMP, { recursive: true });
  const target = path.join(TMP, name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(target));
  return target;
}

function pngSize(file) {
  const b = readFileSync(file);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

async function main() {
  await mkdir(BUILD, { recursive: true });

  const downloaded = [];
  for (const src of SOURCES) {
    process.stdout.write(`Descargando ${src.name} ... `);
    try {
      downloaded.push(await download(src));
      console.log(`ok (${await pngSize(downloaded.at(-1))})`);
    } catch (err) {
      console.log(`FALLO (${err.message})`);
    }
  }

  if (downloaded.length === 0) throw new Error('No se pudo descargar ningun recurso del sitio.');

  const { default: pngToIco } = await import('png-to-ico');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const primary = downloaded[0];

  for (const [outName, source] of [
    ['icon.ico', primary],
    ['installerIcon.ico', downloaded[1] ?? primary]
  ]) {
    const buf = await pngToIco(source, { sizes, bitDepth: 32 });
    await writeFile(path.join(BUILD, outName), buf);
    console.log(`build/${outName}  ${(buf.length / 1024).toFixed(1)} KB  (${sizes.join('/')} px)`);
  }

  for (const src of SOURCES) {
    const file = path.join(TMP, src.name);
    try {
      await readFile(file);
    } catch {
      continue;
    }
    await writeFile(path.join(ROOT, 'src', 'renderer', 'assets', src.name), readFileSync(file));
    console.log(`src/renderer/assets/${src.name}`);
  }
}

main().catch((err) => {
  console.error('build-icons fallo:', err.message);
  process.exit(1);
});