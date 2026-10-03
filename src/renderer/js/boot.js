'use strict';

(async () => {
  const status = document.getElementById('status');
  const meta = document.getElementById('meta');

  try {
    const info = await window.ECDesktop.app.info();
    status.textContent = 'Instancia nativa lista';
    meta.textContent = `v${info.version} · Electron ${info.electron} · Chromium ${info.chrome} · ${info.arch}`;
  } catch (err) {
    status.textContent = 'Sin puente nativo';
    meta.textContent = String(err && err.message ? err.message : err);
  }
})();