import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Sonda de senalizacion P2P.
 *
 * Levanta la app y espera a que el sitio complete el handshake con PeerJS Cloud
 * y publique el codigo de 6 digitos (mas el QR y el temporizador rotativo).
 *
 * NO es parte del smoke test porque necesita internet: en una maquina sin red el
 * handshake nunca termina y el test fallaria por el motivo equivocado. Es una
 * comprobacion manual: "la app registra en la nube y muestra un codigo".
 *
 *   node tools/probe-code.mjs                              # sobre el repo
 *   node tools/probe-code.mjs dist\win-unpacked\ECSendPro.exe
 *   node tools/probe-code.mjs "%LOCALAPPDATA%\Programs\ECSendPro\ECSendPro.exe"
 */
const target = process.argv[2];

let cmd = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
let args = ['.'];

if (target) {
  cmd = path.resolve(target);
  if (!existsSync(cmd)) {
    console.error(`No existe: ${cmd}`);
    process.exit(1);
  }
  args = [];
}

const child = spawn(cmd, [...args, '--no-sandbox'], {
  cwd: ROOT,
  env: { ...process.env, EC_SMOKE_TEST: '1', EC_PROBE_CODE: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let out = '';
const capture = (buf) => {
  out += buf.toString();
};
child.stdout.on('data', capture);
child.stderr.on('data', capture);

const timer = setTimeout(() => {
  console.log('\nPROBE_CODE FAIL no apareció un código de 6 dígitos en 45s');
  child.kill();
  process.exit(1);
}, 45000);

child.on('exit', () => {
  clearTimeout(timer);
  const lines = out.split('\n').filter((l) => l.includes('PROBE_CODE'));
  console.log(lines.join('\n') || 'sin salida de la sonda');
  process.exit(/PROBE_CODE ok/.test(out) ? 0 : 1);
});