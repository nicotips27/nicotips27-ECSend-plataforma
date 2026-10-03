'use strict';

const { protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'ecsendpro';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm'
};

/**
 * Registra app:// como esquema privilegiado. Sin esto el renderer navegaria por
 * file:// y localStorage/IndexedDB quedan en un origen opaco: los ajustes y el
 * historial no sobreviven al reinicio de la app.
 */
function registerSchemePrivileges() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        allowServiceWorkers: false
      }
    }
  ]);
}

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Sirve src/renderer desde app://ecsendpro/ con proteccion contra path traversal.
 */
function serveRenderer(rootDir) {
  const root = path.resolve(rootDir);

  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname.endsWith('/')) pathname += 'index.html';

    const target = path.resolve(root, '.' + pathname);
    const inside = target === root || target.startsWith(root + path.sep);

    if (!inside) {
      return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
    }

    try {
      const res = await net.fetch(pathToFileURL(target).toString());
      if (res.status === 404 || res.status === 0) {
        return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
      }
      const headers = new Headers(res.headers);
      headers.set('content-type', mimeFor(target));
      headers.set('cache-control', 'no-cache');
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
  });
}

const INDEX_URL = `${SCHEME}://${HOST}/index.html`;

module.exports = { SCHEME, HOST, INDEX_URL, registerSchemePrivileges, serveRenderer };