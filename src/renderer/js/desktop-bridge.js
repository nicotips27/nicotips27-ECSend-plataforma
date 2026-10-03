'use strict';

(function desktopBridge() {
  const native = window.ECDesktop;

  window.__EC_DESKTOP__ = {
    enabled: !!native,
    version: 4
  };

  if (!native) {
    console.info('[ECDesktop] puente nativo ausente: la app corre como sitio web');
    return;
  }

  console.info('[ECDesktop] ejecutando como app nativa de escritorio');

  const FOLDER_KEY = 'ecsend_download_folder';

  function getFolder() {
    try {
      const v = localStorage.getItem(FOLDER_KEY);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }

  function setFolder(folder) {
    try {
      localStorage.setItem(FOLDER_KEY, JSON.stringify(folder));
    } catch { /* ignore */ }
  }

  function clearFolder() {
    try {
      localStorage.removeItem(FOLDER_KEY);
    } catch { /* ignore */ }
  }

  function makeFakeHandle(folder) {
    return {
      kind: 'directory',
      name: folder ? folder.split('\\').pop() || folder : 'ECSendPRO',
      getFileHandle: async (name) => ({
        kind: 'file',
        name,
        createWritable: async () => {
          const chunks = [];
          return {
            write: (chunk) => { chunks.push(chunk); },
            close: async () => {
              const blob = new Blob(chunks);
              const fullPath = folder ? folder + '\\' + name : name;
              await native.downloads.saveReceived(fullPath, blob);
            },
            abort: () => {}
          };
        }
      }),
      removeEntry: async () => {}
    };
  }

  let currentHandle = null;
  const saved = getFolder();
  if (saved) currentHandle = makeFakeHandle(saved);

  Object.defineProperty(window, 'downloadDirHandle', {
    get: () => currentHandle,
    configurable: true
  });

  window.selectDownloadFolder = async function selectDownloadFolder() {
    try {
      const result = await native.downloads.chooseFolder();
      if (!result.success) return;
      currentHandle = makeFakeHandle(result.folder);
      setFolder(result.folder);
      window.updateDownloadPathUI && window.updateDownloadPathUI(currentHandle);
      window.showToast && window.showToast('Carpeta de descargas configurada', 'success');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      window.showToast && window.showToast('No se pudo seleccionar la carpeta', 'error');
    }
  };

  window.clearDownloadPath = async function clearDownloadPath() {
    currentHandle = null;
    clearFolder();
    await native.downloads.clearFolder();
    window.updateDownloadPathUI && window.updateDownloadPathUI(null);
    window.showToast && window.showToast('Carpeta de descargas restablecida', 'info');
  };

  window.showDirectoryPicker = async function showDirectoryPicker() {
    const result = await native.downloads.chooseFolder();
    if (!result.success) {
      throw new DOMException('El usuario canceló la selección', 'AbortError');
    }
    currentHandle = makeFakeHandle(result.folder);
    setFolder(result.folder);
    return currentHandle;
  };

  window.addEventListener('DOMContentLoaded', () => {
    native.downloads.onProgress((data) => {
      window.dispatchEvent(new CustomEvent('ecdownload:progress', { detail: data }));
    });
    native.downloads.onCompleted((data) => {
      window.dispatchEvent(new CustomEvent('ecdownload:completed', { detail: data }));
      window.showToast && window.showToast(`Guardado: ${data.filename}`, 'success');
    });
    native.downloads.onFailed((data) => {
      window.dispatchEvent(new CustomEvent('ecdownload:failed', { detail: data }));
      window.showToast && window.showToast(`Error guardando ${data.filename}`, 'error');
    });
  });

  console.info('[ECDesktop] polyfills de descargas y carpeta instalados');
})();