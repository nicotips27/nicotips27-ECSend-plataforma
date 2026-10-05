import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCsp } from './csp-hashes.mjs';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'src/main/main.js',
  'src/main/protocol.js',
  'src/main/downloads.js',
  'src/preload/preload.js',
  'src/renderer/js/desktop-bridge.js'
];

/**
 * Reglas que salen de la auditoria. No son estilo: cada una tapa una forma
 * concreta de romper la app de escritorio.
 */
const BANNED = [
  {
    file: 'src/renderer/js/desktop-bridge.js',
    pattern: /downloadDirHandle/,
    why: 'el sitio usa una variable local propia; pisar window.downloadDirHandle no conecta nada y rompe el setter'
  },
  {
    file: 'src/renderer/js/desktop-bridge.js',
    pattern: /saveReceived/,
    why: 'un Blob no cruza ipcRenderer.invoke (DataCloneError) y la escritura ya la hace will-download'
  },
  {
    file: 'src/renderer/js/desktop-bridge.js',
    pattern: /makeFakeHandle/,
    why: 'un handle falso con funciones no se puede guardar en IndexedDB (DataCloneError)'
  }
];

let failed = 0;

for (const file of TARGETS) {
  try {
    await exec(process.execPath, ['--check', path.join(ROOT, file)]);
    console.log(`  ok   ${file}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${file}`);
    console.log(`       ${String(err.stderr || err.message).split('\n').slice(0, 3).join('\n       ')}`);
  }
}

console.log('');
for (const rule of BANNED) {
  const source = await readFile(path.join(ROOT, rule.file), 'utf8');
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    if (rule.pattern.test(line)) {
      failed++;
      console.log(`  FAIL ${rule.file}:${i + 1}  ${rule.pattern}`);
      console.log(`       ${rule.why}`);
    }
  });
}

/** El sitio importa app.js verbatim: si se pierde, no hay app. */
try {
  await readFile(path.join(ROOT, 'src/renderer/js/app.js'), 'utf8');
  console.log('  ok   src/renderer/js/app.js presente');
} catch {
  failed++;
  console.log('  FAIL falta src/renderer/js/app.js (importar con: npm run import:site)');
}

/** El CSS compilado tiene que existir y no estar vacio. */
try {
  const css = await readFile(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');
  if (css.length < 10000) throw new Error(`styles.css demasiado chico: ${css.length} bytes`);
  console.log(`  ok   src/renderer/styles.css (${(css.length / 1024).toFixed(1)} KB)`);
} catch (err) {
  failed++;
  console.log(`  FAIL styles.css: ${err.message}. Compilar con: npm run css`);
}

/**
 * La CSP tiene que habilitar los handlers on* del sitio por hash. Sin esto la
 * app arranca, el smoke test pasa y NINGUN boton responde: el CSP bloquea los
 * atributos on* en silencio. Es el bug mas caro de esta app (35 handlers).
 */
try {
  const html = await readFile(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
  const audit = auditCsp(html);
  if (!audit.ok) throw new Error(audit.reason);
  console.log(`  ok   CSP: ${audit.total} handlers on* habilitados por sha256 (${audit.hashes} unicos)`);
} catch (err) {
  failed++;
  console.log(`  FAIL CSP: ${err.message}`);
  console.log('       Reimportar con: npm run import:site');
}

/** Los .ico tienen que estar antes de empaquetar. */
for (const ico of ['icon.ico', 'installerIcon.ico', 'tray.ico']) {
  try {
    await readFile(path.join(ROOT, 'build', ico));
    console.log(`  ok   build/${ico}`);
  } catch {
    failed++;
    console.log(`  FAIL falta build/${ico}. Generar con: npm run icons`);
  }
}

try {
  const vendor = await readdir(path.join(ROOT, 'src/renderer/vendor'));
  const need = ['lucide.min.js', 'peerjs.min.js', 'qrious.min.js', 'html5-qrcode.min.js', 'tsparticles.slim.bundle.min.js'];
  const missing = need.filter((f) => !vendor.includes(f));
  if (missing.length) throw new Error(`faltan: ${missing.join(', ')}`);
  console.log(`  ok   src/renderer/vendor (${need.length} librerias)`);
} catch (err) {
  failed++;
  console.log(`  FAIL vendor: ${err.message}. Bajar con: npm run vendor`);
}

console.log('');
if (failed) {
  console.log(`lint: ${failed} problema(s)`);
  process.exit(1);
}
console.log('lint: todo OK');