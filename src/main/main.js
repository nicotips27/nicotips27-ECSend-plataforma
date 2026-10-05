'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, Tray, Notification, dialog, ipcMain, shell, session } = require('electron');
const downloads = require('./downloads');

const PRODUCT = 'ECSend Pro';
const COMPANY = 'Estalingrado Corp';

let win = null;
let tray = null;
let quitting = false;

const SMOKE = process.env.EC_SMOKE_TEST === '1';

const rendererRoot = path.join(__dirname, '..', 'renderer');

/**
 * Resuelve un icono de build/ tanto en desarrollo como en el paquete instalado.
 */
function iconPath(name = 'icon.ico') {
  const candidates = [
    path.join(__dirname, '..', '..', 'build', name),
    path.join(process.resourcesPath || '', name)
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || '';
}

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 860,
    minWidth: 400,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0a',
    title: PRODUCT,
    icon: iconPath(),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#e5e7eb',
      height: 44
    },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  win.once('ready-to-show', () => win.show());

  win.on('close', (e) => {
    if (!quitting && tray) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    win = null;
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.loadURL('app://ecsendpro/index.html');
  return win;
}

/**
 * Espera a que un archivo aparezca en la carpeta de descargas. Devuelve null si
 * no llega en el plazo, para que el smoke test falle en vez de pasar en falso.
 */
function waitForDownload(dir, name, timeoutMs) {
  const target = path.join(dir, name);
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      let stat = null;
      try {
        stat = fs.statSync(target);
      } catch {
        stat = null;
      }
      if (stat && stat.size > 0) {
        resolve({ path: target, name, bytes: stat.size });
        return;
      }
      if (Date.now() > deadline) {
        resolve(null);
        return;
      }
      setTimeout(tick, 200);
    };
    setTimeout(tick, 400);
  });
}

/**
 * EC_SMOKE_TEST=1 abre la app, verifica que el renderer carga por app:// y el
 * puente preload responde, imprime el resultado en stdout y sale. Lo usa CI.
 *
 * La sonda no solo mira el preload: tambien confirma que llego el CSS compilado
 * (no el Play CDN), que la fuente Inter vendorizada cargo y que las librerias
 * locales quedaron expuestas en el renderer.
 */
function runSmokeTest(window) {
  const started = Date.now();
  const consoleErrors = [];
  const cspViolations = [];

  const dump = () => {
    if (consoleErrors.length) console.log(`SMOKE_CONSOLE_ERRORS ${JSON.stringify(consoleErrors.slice(0, 8))}`);
    if (cspViolations.length) console.log(`SMOKE_CSP_VIOLATIONS ${JSON.stringify(cspViolations.slice(0, 8))}`);
  };

  let finished = false;
  const fail = (reason) => {
    if (finished) return;
    finished = true;
    console.log(`SMOKE_FAIL ${reason}`);
    dump();
    app.exit(1);
  };
  const timer = setTimeout(() => fail('timeout de 25s'), 25000);

  window.webContents.on('console-message', (event) => {
    const level = event.level ?? event.levelName ?? 'info';
    if (level === 'error' || level === 3) consoleErrors.push(event.message ?? String(event));
    if (/Content Security Policy|Refused to/i.test(event.message ?? '')) {
      cspViolations.push(event.message ?? '');
    }
  });

  window.webContents.on('render-process-gone', (_e, details) =>
    fail(`render process gone: ${details.reason}`)
  );

  const probe = `(() => {
    const cssHref = Array.from(document.styleSheets)
      .map((s) => s.href || '')
      .find((h) => h.endsWith('styles.css'));

    let rules = [];
    let cssError = null;
    if (cssHref) {
      const sheet = Array.from(document.styleSheets).find((s) => (s.href || '').endsWith('styles.css'));
      try {
        rules = sheet ? Array.from(sheet.cssRules).map((r) => r.cssText) : [];
        if (!sheet) cssError = 'sheet no encontrado en document.styleSheets';
      } catch (e) {
        cssError = e && e.name + ': ' + e.message;
        rules = [];
      }
    } else {
      cssError = 'styles.css no aparece en document.styleSheets';
    }

    const has = (needle) => rules.some((r) => r.includes(needle));

    return JSON.stringify({
      url: location.href,
      origin: location.origin,
      title: document.title,
      bridge: !!window.ECDesktop,
      desktopBridge: !!window.__EC_DESKTOP__,
      version: ${JSON.stringify(app.getVersion())},
      electron: ${JSON.stringify(process.versions.electron)},
      localStorage: (() => { try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return true; } catch { return false; } })(),
      css: {
        linked: !!cssHref,
        ruleCount: rules.length,
        error: cssError,
        href: cssHref,
        sheets: Array.from(document.styleSheets).map((s) => s.href || 'inline'),
        hasFontFace: has('@font-face'),
        hasTextPrimary: has('.text-primary'),
        hasHidden: has('.hidden'),
        hasSlideUp: has('animate-slide-up'),
        hasGlassPanel: [...document.styleSheets].length > 0 &&
          [...document.querySelectorAll('style')].some((s) => s.textContent.includes('.glass-panel'))
      },
      fonts: {
        inter: [...document.fonts].some((f) => f.family.includes('Inter')),
        bodyFamily: getComputedStyle(document.body).fontFamily
      },
      vendor: {
        lucide: typeof window.lucide,
        peer: typeof window.Peer,
        qrious: typeof window.QRious,
        html5qrcode: typeof window.Html5Qrcode,
        tsParticles: typeof window.tsParticles
      },
      appJsRan: typeof window.showToast === 'function' && typeof window.selectDownloadFolder === 'function',
      remoteScripts: [...document.querySelectorAll('script[src^="http"]')].map((s) => s.src)
    });
  })()`;

  /**
   * Auditoria de los botones de la pagina.
   *
   * El sitio usa 35 atributos on* inline. Con la CSP de escritorio, un
   * script-src sin 'unsafe-hashes' los BLOQUEA en silencio: la app carga, el
   * smoke test pasa, y ningun boton responde. Por eso esta auditoria hace dos
   * cosas: comprueba que cada handler este permitido por sha256 en la CSP, y
   * despues dispara el evento de cada uno con las funciones del sitio
   * stubbeadas, para confirmar que el handler realmente corre.
   */
  const buttonAudit = `(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      violations.push(e.violatedDirective + ' :: ' + (e.sample || '')), true);

    const csp = (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '';
    const allowed = new Set(csp.match(/'sha256-[A-Za-z0-9+/=_-]+'/g) || []);

    const sha256 = async (text) => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const bytes = new Uint8Array(digest);
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      return "sha256-" + btoa(bin);
    };

    const targets = [...document.querySelectorAll('*')].filter((el) =>
      [...el.attributes].some((a) => /^on[a-z]+$/.test(a.name)));

    // 1) Estatico: cada handler tiene que estar en la lista de la CSP.
    const missing = [];
    const codes = new Set();
    for (const el of targets) {
      for (const a of el.attributes) {
        if (!/^on[a-z]+$/.test(a.name)) continue;
        codes.add(a.value);
        if (!allowed.has("'" + (await sha256(a.value)) + "'")) {
          missing.push(a.name + "=" + a.value.slice(0, 40));
        }
      }
    }

    // 2) Vivo: click real en cada elemento, con el sitio stubbeado.
    const calls = [];
    const restore = [];
    const stub = (obj, key, label) => {
      const had = Object.prototype.hasOwnProperty.call(obj, key);
      const prev = obj[key];
      const replacement = function () { calls.push(label); };
      try {
        obj[key] = replacement;
      } catch {
        return false;
      }
      // location.reload es [LegacyUnforgeable]: la asignacion falla en silencio
      // sin lanzar. Sin esta comprobacion se creeria que el stub funciono.
      if (obj[key] !== replacement) return false;
      restore.push(() => { try { if (had) obj[key] = prev; else delete obj[key]; } catch {} });
      return true;
    };

    // Las funciones que el sitio expone en window y los handlers invocan.
    for (const name of new Set(
      [...codes].flatMap((c) => (c.match(/window\\.([A-Za-z0-9_$]+)/g) || []).map((s) => s.slice(7)))
    )) {
      stub(window, name, name);
    }
    // Los dos botones de galeria hacen .click() sobre un <input type=file>.
    stub(HTMLInputElement.prototype, 'click', 'file-input.click');

    let reloadStub = false;
    try {
      reloadStub = stub(window.location, 'reload', 'location.reload');
    } catch { reloadStub = false; }

    let clicked = 0;
    let skipped = 0;
    for (const el of targets) {
      const attr = [...el.attributes].find((a) => /^on[a-z]+$/.test(a.name));
      const code = attr.value;
      const before = calls.length;
      if (/location\\.reload/.test(code) && !reloadStub) { skipped++; continue; }
      if (attr.name === 'onsubmit') {
        el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      } else if (attr.name === 'onkeypress' || attr.name === 'onkeydown') {
        el.dispatchEvent(new KeyboardEvent(attr.name.slice(2), { key: 'Enter', bubbles: true }));
      } else {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      clicked++;
      if (calls.length === before) return JSON.stringify({ ok: false, reason: 'handler sin ejecutar: ' + code });
    }

    for (const undo of restore.reverse()) { try { undo(); } catch {} }

    return JSON.stringify({
      ok: true,
      handlers: targets.length,
      unique: codes.size,
      clicked,
      skipped,
      calls: calls.length,
      violations
    });
  })()`;

  window.webContents.once('did-finish-load', async () => {
    try {
      // Se espera a que corran los scripts diferidos y las inicializaciones
      // asincronas (PeerJS, descubrimiento, fondo de particulas) para que sus
      // errores aparezcan en la consola antes de sondear.
      await window.webContents.executeJavaScript(
        `document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 4000)))`
      );
      const report = await window.webContents.executeJavaScript(probe);

      let buttons;
      try {
        buttons = JSON.parse(await window.webContents.executeJavaScript(buttonAudit));
      } catch (err) {
        fail(`la auditoria de botones no pudo correr: ${err.message}`);
      }
      if (!buttons.ok) {
        fail(`botones: ${buttons.reason}`);
      }
      if (buttons.violations.length) {
        fail(`botones: la CSP bloqueo ${buttons.violations.length} handler(s) -> ${JSON.stringify(buttons.violations.slice(0, 3))}`);
      }
      console.log(
        `SMOKE_BUTTONS ok ${buttons.handlers} handlers on* (${buttons.unique} unicos), ` +
        `${buttons.clicked} clickados en vivo, ${buttons.skipped} auditados por hash, ` +
        `${buttons.calls} llamadas, 0 violaciones CSP`
      );

      // Prueba de descarga de verdad. El sitio, al recibir un archivo por el
      // DataChannel, reconstruye un Blob y dispara un <a download>. Electron
      // lo intercepta con will-download y lo escribe en la carpeta configurada.
      // Si esa carpeta no existe, la descarga falla en silencio: el usuario ve
      // el archivo "recibido" pero no aparece en el disco. Esto lo verifica.
      const dlName = `smoke-${process.pid}.txt`;
      const payload = 'ECSendPro smoke test '.repeat(64);
      await window.webContents.executeJavaScript(`
        (() => {
          const blob = new Blob([${JSON.stringify(payload)}], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = ${JSON.stringify(dlName)};
          document.body.appendChild(a);
          a.click();
          a.remove();
          return true;
        })()
      `);

      const written = await waitForFile(
        downloads.getDownloadFolder(),
        dlName,
        12000
      );

      clearTimeout(timer);
      dump();

      if (!written) {
        console.log(`SMOKE_FAIL la descarga no llego al disco en ${downloads.getDownloadFolder()}`);
        app.exit(1);
      }

      console.log(`SMOKE_DOWNLOAD ok ${written.name} ${written.size} bytes -> ${written.path}`);
      console.log(`SMOKE_OK ${report} ${Date.now() - started}ms`);
      app.exit(0);
    } catch (err) {
      fail(`executeJavaScript: ${err.message}`);
    }
  });
}

/**
 * Espera a que aparezca un archivo en disco. El smoke test la necesita porque
 * will-download escribe de forma asincrona y el renderer ya(io)nio hizo click.
 */
function waitForFile(folder, name, timeoutMs) {
  const target = path.join(folder, name);
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      try {
        const st = fs.statSync(target);
        if (st.size > 0) return resolve({ name, path: target, size: st.size });
      } catch { /* todavia no esta */ }
      if (Date.now() > deadline) return resolve(null);
      setTimeout(tick, 150);
    };
    tick();
  });
}

/**
 * Sonda opt-in (EC_PROBE_CODE=1): espera a que el sitio complete el handshake con
 * PeerJS Cloud y publique el codigo de 6 digitos. Necesita internet, asi que no
 * forma parte del smoke test: solo sirve para ver si la senalizacion arranca.
 */
function runCodeProbe(window) {
  const started = Date.now();
  const read = () =>
    window.webContents.executeJavaScript(`(() => {
      const code = (document.getElementById('my-code')?.textContent || '').trim();
      const timer = (document.getElementById('code-timer-text')?.textContent || '').trim();
      const canvas = document.getElementById('qr-canvas');
      return JSON.stringify({
        code, timer,
        qr: canvas ? (canvas.tagName === 'CANVAS' ? canvas.width + 'x' + canvas.height : 'svg') : null,
        peer: typeof window.myPeer !== 'undefined' && window.myPeer ? window.myPeer.id : null
      });
    })()`).catch((e) => JSON.stringify({ error: e.message }));

  const tick = async () => {
    const info = JSON.parse(await read());
    // El sitio lo muestra agrupado en 3+3 con guion: "827-048"
    const listo = /^\d{3}-\d{3}$/.test(info.code);
    console.log(`PROBE_CODE ${listo ? 'ok' : 'wait'} ${Date.now() - started}ms ${JSON.stringify(info)}`);
    if (listo) { app.exit(0); return; }
    if (Date.now() - started > 35000) { app.exit(2); return; }
    setTimeout(tick, 2000);
  };
  setTimeout(tick, 3000);
}

function createTray() {
  try {
    tray = new Tray(iconPath('tray.ico'));
  } catch {
    tray = null;
    return;
  }
  tray.setToolTip(`${PRODUCT} — ${COMPANY}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Abrir ${PRODUCT}`, click: () => showWindow() },
      { type: 'separator' },
      { label: 'Salir', click: () => quitApp() }
    ])
  );
  tray.on('click', () => showWindow());
}

function showWindow() {
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

function quitApp() {
  quitting = true;
  app.quit();
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    name: PRODUCT,
    company: COMPANY,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
    isPackaged: app.isPackaged
  }));

  downloads.registerIpc();

  ipcMain.handle('notify:show', (_e, options = {}) => {
    if (!win || win.isDestroyed()) return false;
    const n = new Notification({
      title: typeof options.title === 'string' ? options.title : PRODUCT,
      body: typeof options.body === 'string' ? options.body : '',
      icon: iconPath('icon.ico')
    });
    n.on('click', () => showWindow());
    n.show();
    return true;
  });

  ipcMain.handle('shell:showItemInFolder', (_e, target) => {
    if (typeof target === 'string' && target) shell.showItemInFolder(target);
    return true;
  });

  ipcMain.handle('shell:openPath', async (_e, target) => {
    if (typeof target !== 'string' || !target) return '';
    return shell.openPath(target);
  });

  ipcMain.handle('shell:openExternal', async (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });
}

if (!app.requestSingleInstanceLock()) {
  // La app instalada y la de desarrollo comparten userData (las dos se llaman
  // "ECSend Pro"), asi que el cerrojo tambien las excluye entre si. Sin este
  // mensaje el segundo proceso salia con codigo 0 sin hacer nada: en el smoke
  // test parecia "todo bien" y en la vida real parecia "la app no arranca".
  console.error(
    '[ECSendPro] Ya hay otra instancia corriendo. Cerrala o usa el icono de la ' +
    'bandeja para abrirla. La instancia nueva se cierra sin hacer nada.'
  );
  if (SMOKE) console.log('SMOKE_FAIL otra instancia de ECSend Pro ya esta corriendo');
  app.quit();
} else {
  const { registerSchemePrivileges, serveRenderer } = require('./protocol');
  registerSchemePrivileges();

  app.setAppUserModelId('com.estalingradocorp.ecsendpro');

  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    serveRenderer(rendererRoot);
    registerIpc();
    downloads.setup({ getWindow: () => win });

    // Permisos de cámara/micrófono: auto-aceptar para que html5-qrcode funcione
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') callback(true);
      else callback(false);
    });

    createWindow();
    if (!SMOKE) createTray();
    if (SMOKE) runSmokeTest(win);
    if (process.env.EC_PROBE_CODE === '1') runCodeProbe(win);

    app.on('activate', () => showWindow());
  }).catch((err) => {
    if (SMOKE) {
      console.log(`SMOKE_FAIL whenReady: ${err && err.stack ? err.stack : err}`);
      app.exit(1);
    } else {
      dialog.showErrorBox(`${PRODUCT} — ${COMPANY}`, String(err && err.stack ? err.stack : err));
      app.exit(1);
    }
  });

  app.on('window-all-closed', () => {
    if (!tray) app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
  });
}