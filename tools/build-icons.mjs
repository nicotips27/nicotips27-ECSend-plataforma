import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const PNG = path.join(BUILD, 'png');
const MASTER = path.join(ROOT, 'icono', 'logo.jpg');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function pngSize(file) {
  const b = readFileSync(file);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

async function hasAlpha(file) {
  const b = readFileSync(file);
  return b[25] === 6 || b[25] === 4; // color type 6 = RGBA, 4 = gray+alpha
}

async function ensurePngs() {
  try {
    await readFile(path.join(PNG, `logo-${ICO_SIZES.at(-1)}.png`));
    return 'cache';
  } catch {
    /* hay que generarlos */
  }
  await exec(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'tools', 'convert-icon.ps1')],
    { windowsHide: true }
  );
  return 'generados';
}

async function main() {
  await mkdir(BUILD, { recursive: true });

  try {
    await readFile(MASTER);
  } catch {
    console.error(`Falta el logo maestro: ${MASTER}`);
    process.exit(1);
  }

  const state = await ensurePngs();
  console.log(`PNG de trabajo: ${state}`);

  const sources = [];
  for (const size of ICO_SIZES) {
    const file = path.join(PNG, `logo-${size}.png`);
    await readFile(file);
    sources.push(file);
  }

  const large = sources.at(-1);
  const alpha = await hasAlpha(large);
  console.log(`Fuente: icono/logo.jpg (${pngSize(large)} px, alfa: ${alpha ? 'si' : 'NO'})`);
  if (!alpha) {
    console.log('Aviso: la fuente es JPEG, sin transparencia. Para la bandeja de Windows');
    console.log('       conviene un PNG con fondo transparente en icono/logo.png');
  }

  const { default: pngToIco } = await import('png-to-ico');

  const outputs = [
    ['icon.ico', sources],
    ['installerIcon.ico', sources],
    ['tray.ico', sources.filter((_, i) => ICO_SIZES[i] <= 64)]
  ];

  for (const [name, files] of outputs) {
    const buf = await pngToIco(files);
    await writeFile(path.join(BUILD, name), buf);
    console.log(`build/${name}  ${(buf.length / 1024).toFixed(1)} KB  (${files.length} resoluciones)`);
  }

  console.log('build/icon.ico           app, ventana y acceso directo');
  console.log('build/installerIcon.ico  instalador NSIS');
  console.log('build/tray.ico           bandeja del sistema');
}

main().catch((err) => {
  console.error('build-icons fallo:', err && err.stack ? err.stack : err);
  process.exit(1);
});