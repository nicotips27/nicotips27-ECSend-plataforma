'use strict';

/**
 * Puente de escritorio para ECSend Pro.
 *
 * app.js viene verbatim del sitio web, asi que este archivo NO intenta
 * replicar la File System Access API. En vez de eso deja que el sitio use su
 * camino normal (`<a download>`), que Electron intercepta con will-download y
 * guarda en la carpeta configurada. Un solo camino, sin handles falsos.
 *
 * Lo unico que hay que sobreescribir son las tres funciones que el sitio
 * expone en window, y se sobreescriben DESPUES de que corra app.js: los
 * scripts diferidos se ejecutan en orden de documento, asi que app.js pisa
 * cualquier override puesto antes.
 */
(function desktopBridge() {
  const native = window.ECDesktop;

  window.__EC_DESKTOP__ = { enabled: !!native, version: 5 };

  if (!native) {
    console.info('[ECDesktop] puente nativo ausente: la app corre como sitio web');
    return;
  }

  console.info('[ECDesktop] ejecutando como app nativa de escritorio');

  let currentFolder = null;

  function folderLabel() {
    if (!currentFolder) return 'Descarga predeterminada del navegador';
    return currentFolder;
  }

  /** Reemplaza las funciones del sitio por las nativas. */
  function patchSite() {
    // En Electron no existe showDirectoryPicker. Decirlo false mantiene al
    // sitio en su camino de descarga por <a download>, que es el que
    // intercepta will-download.
    if ('showDirectoryPicker' in window) {
      delete window.showDirectoryPicker;
    }

    window.selectDownloadFolder = async function selectDownloadFolder() {
      try {
        const result = await native.downloads.chooseFolder();
        if (!result || !result.success) return;
        currentFolder = result.folder;
        window.showToast('Carpeta de descarga configurada', 'success');
      } catch (err) {
        window.showToast('No se pudo seleccionar la carpeta', 'error');
      }
      renderFolderUI();
    };

    window.clearDownloadPath = async function clearDownloadPath() {
      await native.downloads.clearFolder();
      const { folder } = await native.downloads.getFolder();
      currentFolder = null;
      window.showToast('Usando carpeta predeterminada', 'info');
      renderFolderUI();
    };

    // updateDownloadPathUI() del sitio lee su propia variable de handle, que en
    // Electron siempre es null. Se reescribe para mostrar la ruta nativa.
    window.updateDownloadPathUI = function updateDownloadPathUI() {
      const display = document.getElementById('download-path-display');
      const clearBtn = document.getElementById('btn-clear-download-path');
      if (!display) return;
      if (currentFolder) {
        display.innerText = currentFolder;
        display.classList.remove('text-zinc-400');
        display.classList.add('text-white');
        if (clearBtn) clearBtn.classList.remove('hidden');
      } else {
        display.innerText = 'Descarga predeterminada del navegador';
        display.classList.remove('text-white');
        display.classList.add('text-zinc-400');
        if (clearBtn) clearBtn.classList.add('hidden');
      }
    };

    renderFolderUI();
  }

  function renderFolderUI() {
    if (typeof window.updateDownloadPathUI === 'function') {
      try {
        window.updateDownloadPathUI();
      } catch { /* el sitio todavia no esta listo */ }
    }
  }

  /** El sitio muestra "no soporta carpetas" si falta showDirectoryPicker. */
  function fixUnsupportedWarning() {
    const warn = document.getElementById('download-folder-warning');
    if (warn) warn.classList.add('hidden');
  }

  function start() {
    patchSite();
    fixUnsupportedWarning();

    native.downloads.getFolder().then(({ folder, isCustom }) => {
      currentFolder = isCustom ? folder : null;
      renderFolderUI();
    });

    native.downloads.onCompleted(({ filename, path: savedPath }) => {
      window.dispatchEvent(new CustomEvent('ecdownload:completed', { detail: { filename, path: savedPath } }));
      window.showToast && window.showToast(`Guardado: ${filename}`, 'success');
      if (window.lucide) window.lucide.createIcons();
    });

    native.downloads.onFailed(({ filename }) => {
      window.showToast && window.showToast(`No se pudo guardar ${filename}`, 'error');
    });

    native.cameras.list().then((cameras) => {
      window.__EC_DESKTOP__.cameras = cameras;
      console.info(`[ECDesktop] camaras detectadas: ${cameras.length}`);
    });

    console.info('[ECDesktop]Overrides nativos aplicados sobre app.js');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();