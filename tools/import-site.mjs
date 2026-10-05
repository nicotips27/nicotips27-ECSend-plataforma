import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCsp, handlerHashes } from './csp-hashes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = path.join(ROOT, '.upstream');
const RENDERER = path.join(ROOT, 'src', 'renderer');

/**
 * Importa el sitio web (Estalingradocorp/ECsendpro@main) al fork local.
 *
 * Cada edicion usa una ancora EXACTA y aborta si no aparece: si el sitio cambia
 * algo, el import falla en vez de dejar el fork silenciosamente roto.
 *
 * Ejecuta `npm run sync` antes para tener .upstream/ al dia.
 */

/**
 * CSP de la app de escritorio.
 *
 * - connect-src: PeerJS Cloud (wss), relays nostr de Trystero (wss), ipify (https)
 *   y el propio origen app://
 * - img-src: el GIF de publicidad de Estalingrado Market vive en wixstatic
 * - script-src: 'self' mas cdn.jsdelivr.net porque Trystero se carga por
 *   import() dinamico y no tiene bundle standalone (sus relays son remotos, el
 *   descubrimiento ya requiere internet por diseno)
 * - script-src-attr: el sitio usa 35 atributos on* inline (onclick, onsubmit,
 *   onkeypress). Sin esto la CSP los BLOQUEA en silencio y ningun boton
 *   responde. Se listan los sha256 de esos handlers en vez de 'unsafe-inline'
 *   porque el sitio mete texto remoto en innerHTML sin escapar.
 *
 * El texto de la CSP se arma con buildCsp(HTML_FINAL), despues de todas las
 * ediciones, para que los hashes correspondan al HTML que se escribe.
 */

const HTML_EDITS = [
  {
    label: 'Play CDN + config inline -> CSS compilado con tailwind.config.js',
    from: /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*<script>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/,
    to: '<link rel="stylesheet" href="styles.css">'
  },
  {
    label: 'Google Fonts -> Inter vendorizado',
    from: "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');",
    to: "@import url('vendor/fonts/inter.css');"
  },
  {
    label: 'viewport-fit=cover fuera (en Electron empuja el contenido bajo la barra de titulo nativa)',
    from: '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">',
    to: '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
  },
  {
    label: 'padding-top de 44px para el titleBarOverlay de Electron',
    from: '            touch-action: pan-y;\n        }',
    to: '            touch-action: pan-y;\n            /* Espacio para titleBarOverlay de Electron en Windows (44px fijo) */\n            padding-top: 44px;\n        }'
  },
  {
    label: 'fondo dinámico arranca abajo de la barra de título',
    from: '<div id="dynamic-bg" class="fixed inset-0 z-[-1]',
    to: '<div id="dynamic-bg" class="fixed left-0 right-0 bottom-0 top-[44px] z-[-1]'
  },
  {
    label: 'splash arranca abajo de la barra de título',
    from: '<div id="splash" class="fixed inset-0 z-[100]',
    to: '<div id="splash" class="fixed left-0 right-0 bottom-0 top-[44px] z-[100]'
  },
  {
    label: 'lucide UMD -> vendor',
    from: '<script src="https://unpkg.com/lucide@0.462.0/dist/umd/lucide.min.js" defer></script>',
    to: '<script src="vendor/lucide.min.js" defer></script>'
  },
  {
    label: 'QRious -> vendor',
    from: '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js" defer></script>',
    to: '<script src="vendor/qrious.min.js" defer></script>'
  },
  {
    label: 'html5-qrcode -> vendor',
    from: '<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js" defer></script>',
    to: '<script src="vendor/html5-qrcode.min.js" defer></script>'
  },
  {
    label: 'tsparticles -> vendor',
    from: '<script src="https://cdn.jsdelivr.net/npm/tsparticles-slim@2.0.6/tsparticles.slim.bundle.min.js" defer></script>',
    to: '<script src="vendor/tsparticles.slim.bundle.min.js" defer></script>'
  },
  {
    label: 'PeerJS -> vendor',
    from: '<script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js" defer></script>',
    to: '<script src="vendor/peerjs.min.js" defer></script>'
  },
  {
    label: 'app.js sin cache-busting + puente de escritorio',
    from: '<script src="js/app.js?v=16" defer></script>',
    to: '<script src="js/desktop-bridge.js" defer></script>\n    <script src="js/app.js" defer></script>'
  },
  {
    label: 'manifiesto PWA (innecesario en escritorio)',
    from: '<link rel="manifest" href="./manifest.webmanifest">',
    to: ''
  }
];

/**
 * Clases que el sitio define en su propio <style>, no Tailwind. Si desaparecen
 * del import significa que el sitio cambio y hay que revisarlas a mano.
 * animate-slide-up NO va aca: viene de la config de Tailwind del sitio.
 */
const SITE_STYLE_CLASSES = ['.hidden', '.glass-panel', '.radar-cone'];

function applyEdit(source, { label, from, to }) {
  if (typeof from === 'string') {
    const count = source.split(from).length - 1;
    if (count !== 1) throw new Error(`${label}: se esperaba 1 coincidencia, halladas ${count}`);
    return source.replace(from, to);
  }
  if (!from.test(source)) throw new Error(`${label}: no se encontro el patron`);
  return source.replace(from, to);
}

async function main() {
  let html;
  let js;
  try {
    html = await readFile(path.join(UPSTREAM, 'index.html'), 'utf8');
    js = await readFile(path.join(UPSTREAM, 'js', 'app.js'), 'utf8');
  } catch {
    console.error('Falta .upstream/. Ejecuta primero:  npm run sync');
    process.exit(1);
  }

  console.log('Aplicando ediciones a index.html:');
  let out = html;
  for (const edit of HTML_EDITS) {
    out = applyEdit(out, edit);
    console.log(`  ok  ${edit.label}`);
  }

  const missingStyle = SITE_STYLE_CLASSES.filter((c) => !out.includes(c));
  if (missingStyle.length) {
    console.error(`\nEl <style> del sitio perdio: ${missingStyle.join(', ')}`);
    process.exit(1);
  }

  // La CSP va al final y se arma con el HTML ya editado: los sha256 de los
  // handlers on* tienen que calzar con el HTML exacto que se escribe.
  const hashes = handlerHashes(out);
  if (!hashes.length) {
    console.error('\nEl sitio ya no tiene atributos on* inline. Revisar el sitio y la CSP.');
    process.exit(1);
  }
  out = applyEdit(out, {
    label: 'CSP de escritorio (script-src-attr con hashes de los handlers on*)',
    from: '<meta name="theme-color" content="#09090b">',
    to: `<meta name="theme-color" content="#09090b">\n    <meta http-equiv="Content-Security-Policy" content="${buildCsp(out)}">`
  });
  console.log(`  CSP: ${hashes.length} sha256 para los handlers on* del sitio`);

  const leftovers = out.match(/(?:src|href)="https:\/\/(?:unpkg|cdnjs|cdn\.tailwindcss)/g) ?? [];
  if (leftovers.length) {
    console.error(`\nQuedaron referencias a CDN sin vendorizar: ${leftovers.join(', ')}`);
    process.exit(1);
  }

  await mkdir(path.join(RENDERER, 'js'), { recursive: true });
  await writeFile(path.join(RENDERER, 'index.html'), out, 'utf8');
  await writeFile(path.join(RENDERER, 'js', 'app.js'), js, 'utf8');

  console.log('\napp.js se importa verbatim (sin ediciones en esta fase).');
  console.log(`index.html: ${html.length} -> ${out.length} bytes (delta ${out.length - html.length >= 0 ? '+' : ''}${out.length - html.length})`);
  console.log('app.js:     copiado tal cual');
  console.log('\nSin referencias a CDN. <style> del sitio intacto. CSP aplicado.');
  console.log('Siguiente paso:  npm run css');
}

main().catch((err) => {
  console.error(`\nimport-site fallo: ${err.message}`);
  process.exit(1);
});