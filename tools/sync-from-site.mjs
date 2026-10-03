import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = path.join(ROOT, '.upstream');

const SITE_REPO = 'Estalingradocorp/ECsendpro';
const SITE_BRANCH = 'main';

/**
 * El renderer de este repo es un fork de primera clase del sitio web: se edita
 * a mano. Este script NO sobreescribe nada. Baja la version vigente del sitio a
 * .upstream/ y muestra el diff contra src/renderer/ para que decidas que portar.
 */
const FILES = [
  { remote: 'index.html', local: 'index.html' },
  { remote: 'js/app.js', local: 'js/app.js' },
  { remote: 'sw.js', local: 'sw.js' },
  { remote: 'manifest.webmanifest', local: 'manifest.webmanifest' }
];

async function download(remote) {
  const url = `https://raw.githubusercontent.com/${SITE_REPO}/${SITE_BRANCH}/${remote}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${remote} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function diff(remote, local) {
  const up = path.join(UPSTREAM, remote);
  const mine = path.join(ROOT, 'src', 'renderer', local);
  try {
    const { stdout } = await exec(
      'git',
      ['diff', '--no-index', '--stat', '--', up, mine],
      { cwd: ROOT, windowsHide: true }
    );
    return stdout.trim();
  } catch (err) {
    return (err.stdout || '').trim() || '(sin diferencias o archivo local ausente)';
  }
}

async function main() {
  const clean = process.argv.includes('--clean');
  if (clean) {
    await rm(UPSTREAM, { recursive: true, force: true });
    console.log('.upstream/ eliminado');
    return;
  }

  await rm(UPSTREAM, { recursive: true, force: true });
  await mkdir(path.join(UPSTREAM, 'js'), { recursive: true });

  console.log(`Sitio: ${SITE_REPO}@${SITE_BRANCH}\n`);

  for (const file of FILES) {
    try {
      const buf = await download(file.remote);
      await writeFile(path.join(UPSTREAM, file.remote), buf);
      const kb = (buf.length / 1024).toFixed(1);
      console.log(`${file.remote.padEnd(22)} ${String(kb).padStart(7)} KB`);
    } catch (err) {
      console.log(`${file.remote.padEnd(22)} FALLO: ${err.message}`);
    }
  }

  console.log('\nDiferencias contra el fork local:');
  for (const file of FILES) {
    const stat = await diff(file.remote, file.local);
    console.log(`  ${file.local.padEnd(22)} ${stat || 'identico'}`);
  }

  console.log(
    '\nEl fork local se edita a mano: este script no aplica nada. Revisa el diff,'
  );
  console.log('porta los cambios a mano y verifica que la app siga andando con npm run verify.');
}

main().catch((err) => {
  console.error('sync-from-site fallo:', err && err.stack ? err.stack : err);
  process.exit(1);
});