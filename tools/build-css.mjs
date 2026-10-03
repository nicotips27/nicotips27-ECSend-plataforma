import { spawn } from 'node:child_process';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = path.join(ROOT, 'src', 'renderer', 'styles.src.css');
const OUTPUT = path.join(ROOT, 'src', 'renderer', 'styles.css');

const bin = path.join(ROOT, 'node_modules', 'tailwindcss', 'lib', 'cli.js');

const args = [
  bin,
  '-c', path.join(ROOT, 'tailwind.config.js'),
  '-i', INPUT,
  '-o', OUTPUT,
  '--minify'
];

process.stdout.write('Compilando Tailwind... ');
const started = Date.now();

const child = spawn(process.execPath, args, {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe']
});

let err = '';
child.stderr.on('data', (b) => (err += b.toString()));
child.stdout.on('data', (b) => process.stdout.write(b.toString()));

child.on('error', (e) => {
  console.log(`FALLO: ${e.message}`);
  process.exit(1);
});

child.on('exit', async (code) => {
  if (code !== 0) {
    console.log(`FALLO (codigo ${code})\n${err.trim()}`);
    process.exit(1);
  }

  const out = await stat(OUTPUT);
  const css = await readFile(OUTPUT, 'utf8');
  const kb = out.size / 1024;

  // Tailwind minificado escapa las barras: .border-primary\/50. Normalizamos
  // antes de buscar para comparar nombres de clase sin comillas.
  const flat = css.replace(/\\/g, '');

  const rules = flat.match(/\.[a-z][a-zA-Z0-9_-]*/g) ?? [];
  console.log(`OK ${kb.toFixed(1)} KB en ${Date.now() - started} ms, ${rules.length} selectores`);

  // Solo utilidades de Tailwind. .glass-panel, .radar-cone y .animate-slide-up
  // los define el <style> propio del sitio, no Tailwind: se verifican aparte
  // contra index.html en tools/import-site.mjs.
  const mustExist = [
    'hidden', 'flex', 'items-center', 'justify-center', 'rounded-xl',
    'bg-primary', 'text-primary', 'border-primary/50',
    'bg-green-500/10', 'text-green-400',
    'bg-yellow-500/10', 'text-yellow-400',
    'bg-zinc-800', 'text-zinc-100',
    'rounded-tr-sm', 'rounded-tl-sm', 'shadow-md',
    'self-end', 'self-start', 'text-white', 'border-white/5'
  ];
  const missing = mustExist.filter((c) => !new RegExp(`\\.${c}(?![a-zA-Z0-9_-])`).test(flat));

  if (missing.length) {
    console.log(`\nCLASES FALTANTES (${missing.length}): ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`${mustExist.length} clases criticas presentes, safelist incluido.`);
});