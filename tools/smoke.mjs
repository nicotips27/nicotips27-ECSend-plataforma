import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function electronBinary() {
  const fromModule = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (existsSync(fromModule)) return fromModule;
  throw new Error('electron no esta instalado. Ejecuta: npm install');
}

const args = process.argv.slice(2);

/**
 * Sin argumentos corre el electron de node_modules sobre el repo (pasa '.').
 * Con un .exe corre esa app ya empaquetada (sin args extra).
 */
let cmd = electronBinary();
let cmdArgs = args.length ? args.slice(0) : ['.'];

if (args.length) {
  cmd = path.resolve(args[0]);
  if (!existsSync(cmd)) {
    console.error(`No existe: ${cmd}`);
    process.exit(1);
  }
  // Si es .exe, no pasar más args (el smoke test usa env var)
  if (cmd.toLowerCase().endsWith('.exe')) {
    cmdArgs = [];
  }
}

const child = spawn(cmd, [...cmdArgs, '--no-sandbox'], {
  cwd: ROOT,
  env: { ...process.env, EC_SMOKE_TEST: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let out = '';
const capture = (buf) => {
  const text = buf.toString();
  out += text;
  process.stdout.write(text);
};

child.stdout.on('data', capture);
child.stderr.on('data', capture);

const timer = setTimeout(() => {
  console.log('\nSMOKE_FAIL timeout de 40s');
  child.kill();
  process.exit(1);
}, 40000);

child.on('exit', (code) => {
  clearTimeout(timer);
  if (/SMOKE_OK/.test(out)) {
    process.exit(0);
  }
  if (/SMOKE_FAIL/.test(out)) process.exit(1);
  console.log(`\nSMOKE_FAIL el proceso salio con codigo ${code} sin resultado`);
  process.exit(1);
});