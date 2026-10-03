'use strict';

const { shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let winGetter = null;

function setup({ getWindow }) {
  winGetter = getWindow;
  const ses = require('electron').session.defaultSession;

  ses.on('will-download', (event, item, webContents) => {
    const win = winGetter ? winGetter() : null;
    const folder = getDownloadFolder();

    const originalFilename = item.getFilename();
    const safeName = sanitizeFilename(originalFilename);
    const targetPath = path.join(folder, safeName);

    // Dedupe: si existe, añade (1), (2)...
    let finalPath = targetPath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(safeName);
      const base = path.basename(safeName, ext);
      finalPath = path.join(folder, `${base} (${counter})${ext}`);
      counter++;
    }

    item.setSavePath(finalPath);

    item.on('updated', (evt, state) => {
      if (state === 'progressing' && win && !win.isDestroyed()) {
        const received = item.getReceivedBytes();
        const total = item.getTotalBytes();
        if (total > 0) {
          const percent = Math.round((received / total) * 100);
          win.webContents.send('download:progress', {
            filename: safeName,
            received,
            total,
            percent
          });
        }
      }
    });

    item.once('done', (evt, state) => {
      if (win && !win.isDestroyed()) {
        if (state === 'completed') {
          win.webContents.send('download:completed', {
            filename: safeName,
            path: finalPath
          });
        } else {
          win.webContents.send('download:failed', {
            filename: safeName,
            state
          });
        }
      }
    });
  });
}

function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 180);
}

function getDownloadFolder() {
  const settings = getSettings();
  if (settings.downloadDir && fs.existsSync(settings.downloadDir)) {
    return settings.downloadDir;
  }
  return path.join(require('electron').app.getPath('downloads'), 'ECSendPRO');
}

const SETTINGS_FILE = path.join(require('electron').app.getPath('userData'), 'settings.json');
let cachedSettings = null;

function getSettings() {
  if (cachedSettings) return cachedSettings;
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    cachedSettings = JSON.parse(data);
    return cachedSettings;
  } catch {
    return {
      downloadDir: null,
      downloadDirHandle: null
    };
  }
}

function saveSettings(settings) {
  cachedSettings = { ...getSettings(), ...settings };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cachedSettings, null, 2));
  return cachedSettings;
}

function registerIpc() {
  const { ipcMain, dialog } = require('electron');

  ipcMain.handle('downloads:choose-folder', async () => {
    const win = winGetter ? winGetter() : null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Elegir carpeta de descargas',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getDownloadFolder()
    });
    if (!result.canceled && result.filePaths.length) {
      const folder = result.filePaths[0];
      saveSettings({ downloadDir: folder });
      return { success: true, folder };
    }
    return { success: false };
  });

  ipcMain.handle('downloads:get-folder', () => {
    return { folder: getDownloadFolder() };
  });

  ipcMain.handle('downloads:clear-folder', () => {
    saveSettings({ downloadDir: null });
    return { folder: getDownloadFolder() };
  });

  ipcMain.handle('downloads:reveal', async (_e, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });

  ipcMain.handle('downloads:open', async (_e, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      await shell.openPath(filePath);
      return true;
    }
    return false;
  });

  ipcMain.handle('downloads:save-received', async (_e, filePath, blobData) => {
    try {
      const buffer = Buffer.from(blobData);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, buffer);
      return { success: true };
    } catch (err) {
      console.error('[downloads] save-received error:', err);
      return { success: false, error: String(err) };
    }
  });
}

module.exports = { setup, registerIpc, getDownloadFolder, getSettings, saveSettings, sanitizeFilename };