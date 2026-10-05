import { createHash } from 'node:crypto';

/**
 * Hashes de los handlers inline (onclick, onsubmit, onkeypress...) del sitio.
 *
 * El index.html del sitio usa atributos on* inline en 33 elementos. La app de
 * escritorio declara una CSP meta con script-src 'self', y CSP bloquea los
 * handlers inline salvo que:
 *   - 'unsafe-inline' aparezca (debilita toda la CSP), o
 *   - se use 'unsafe-hashes' + el hash sha256 exacto de cada handler.
 *
 * Se eligio 'unsafe-hashes': el sitio mete texto remoto (nombres de archivo que
 * manda el peer, mensajes de chat) en innerHTML sin escapar, asi que con
 * 'unsafe-inline' un nombre de archivo malicioso ejecutaria script. Con hashes,
 * solo corre el codigo que el sitio ya trae escrito.
 *
 * Importante: CSP hashea el VALOR del atributo ya decodificado de entidades
 * HTML. Los handlers del sitio no traen entidades (comillas dobles ni &), pero
 * decodeEntities() lo resuelve igual para que un cambio futuro del sitio no
 * rompa los hashes en silencio.
 */

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(value) {
  return value.replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match;
  });
}

/**
 * Indice del '>' que cierra una etiqueta, respetando comillas: un valor de
 * atributo puede contener '>' y una regexp ingenua cortaria la etiqueta antes.
 * Devuelve -1 si no cierra.
 */
function findTagEnd(html, start) {
  let quote = null;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/** Devuelve [{ attr, code }] para cada atributo on* con valor entre comillas dobles. */
export function findInlineHandlers(html) {
  const found = [];
  const push = (tag) => {
    for (const m of tag.matchAll(/\s(on[a-z]+)\s*=\s*"([^"]*)"/g)) {
      found.push({ attr: m[1], code: decodeEntities(m[2]) });
    }
  };

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      i = close === -1 ? html.length : close + 3;
      continue;
    }

    const end = findTagEnd(html, lt);
    if (end === -1) break;
    const tag = html.slice(lt, end + 1);

    // El texto de <script> y <style> no son etiquetas: se saltea para no
    // tomar por atributo algo que en realidad es una cadena.
    const raw = /^<\s*(script|style)\b/i.exec(tag);
    if (raw) {
      const closeTag = `</${raw[1].toLowerCase()}`;
      const close = html.toLowerCase().indexOf(closeTag, end + 1);
      i = close === -1 ? end + 1 : html.indexOf('>', close) + 1 || html.length;
      continue;
    }

    push(tag);
    i = end + 1;
  }
  return found;
}

export function hashHandler(code) {
  const digest = createHash('sha256').update(Buffer.from(code, 'utf8')).digest('base64');
  return `sha256-${digest}`;
}

/** Hashes unicos y ordenados de todos los handlers inline del HTML. */
export function handlerHashes(html) {
  return [...new Set(findInlineHandlers(html).map((h) => hashHandler(h.code)))].sort();
}

/**
 * CSP completa de la app de escritorio, con script-src-attr Armando la lista
 * de hashes a partir del HTML final. Se arma DESPUES de aplicar las ediciones
 * para que los hashes correspondan exactamente al HTML que se escribe.
 */
export function buildCsp(html) {
  const hashes = handlerHashes(html);
  return [
    "default-src 'none'",
    "script-src 'self' https://cdn.jsdelivr.net",
    // CSP exige los hash entre comillas simples: 'sha256-...'. Sin comillas el
    // parser descarta la fuente y avisa "contains an invalid source".
    `script-src-attr 'unsafe-hashes' ${hashes.map((h) => `'${h}'`).join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://static.wixstatic.com",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self' https: wss:",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'"
  ].join('; ');
}

/**
 * Audita un HTML ya escrito: devuelve los handlers que NO estan en la CSP.
 * Es la regla que evita que esto vuelva a romperse en silencio.
 */
export function auditCsp(html) {
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!meta) return { ok: false, reason: 'no hay meta http-equiv Content-Security-Policy' };

  const csp = meta[1];
  if (/script-src[^;]*'unsafe-inline'/.test(csp)) {
    return { ok: false, reason: "script-src usa 'unsafe-inline': permite inyectar script con texto remoto" };
  }
  if (!/script-src-attr[^;]*'unsafe-hashes'/.test(csp)) {
    return { ok: false, reason: "falta script-src-attr con 'unsafe-hashes' (los handlers on* quedarían bloqueados)" };
  }

  const handlers = findInlineHandlers(html);
  const missing = handlers
    .filter((h) => !csp.includes(`'${hashHandler(h.code)}'`))
    .map((h) => `${h.attr}="${h.code.slice(0, 48)}"`);

  return {
    ok: missing.length === 0,
    reason: missing.length ? `handlers sin hash en la CSP: ${missing.slice(0, 3).join(' | ')}` : '',
    total: handlers.length,
    hashes: handlerHashes(html).length,
    missing
  };
}
