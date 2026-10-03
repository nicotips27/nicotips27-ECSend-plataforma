'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell } = require('electron');

const PRODUCT = 'ECSend Pro';
const COMPANY = 'Estalingrado Corp';

let win = null;
let tray = null;
let quitting = false;

const SMOKE = process.env.EC_SMOKE_TEST === '1';

const rendererRoot = path.join(__dirname, '..', 'renderer');

function iconPath() {
  const candidates = [
    path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico')
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
 * EC_SMOKE_TEST=1 abre la app, verifica que el renderer carga por app:// y el
 * puente preload responde, imprime el resultado en stdout y sale. Lo usa CI.
 */
function runSmokeTest(window) {
  const started = Date.now();
  const fail = (reason) => {
    console.log(`SMOKE_FAIL ${reason}`);
    app.exit(1);
  };
  const timer = setTimeout(() => fail('timeout de 20s'), 20000);

  window.webContents.on('render-process-gone', (_e, details) =>
    fail(`render process gone: ${details.reason}`)
  );

  window.webContents.once('did-finish-load', async () => {
    try {
      const report = await window.webContents.executeJavaScript(`
        (async () => {
          const info = window.ECDesktop ? await window.ECDesktop.app.info() : null;
          return JSON.stringify({
            url: location.href,
            origin: location.origin,
            title: document.title,
            bridge: !!window.ECDesktop,
            version: info && info.version,
            electron: info && info.electron,
            localStorage: (() => { try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return true; } catch { return false; } })()
          });
        })()
      `);
      clearTimeout(timer);
      console.log(`SMOKE_OK ${report} ${Date.now() - started}ms`);
      app.exit(0);
    } catch (err) {
      fail(`executeJavaScript: ${err.message}`);
    }
  });
}

function createTray() {
  try {
    tray = new Tray(iconPath());
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
  app.quit();
} else {
  const { registerSchemePrivileges, serveRenderer } = require('./protocol');
  registerSchemePrivileges();

  app.setAppUserModelId('com.estalingradocorp.ecsendpro');

  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    serveRenderer(rendererRoot);
    registerIpc();
    createWindow();
    if (!SMOKE) createTray();
    if (SMOKE) runSmokeTest(win);

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