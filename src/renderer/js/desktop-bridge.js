'use strict';

/**
 * Puente de escritorio. Se carga antes de app.js.
 *
 * En esta fase solo marca el entorno: app.js ya detecta solo el modo escritorio
 * por la ausencia de 'showDirectoryPicker' en window, asi que todavia no
 * necesita comportamiento.
 *
 * Lo que se agregue aca es la capa que usa app.js para reemplazar las APIs que
 * Electron no trae (carpeta de descargas, ajustes, camara, notificaciones).
 */
(function desktopBridge() {
  const native = window.ECDesktop;

  window.__EC_DESKTOP__ = {
    enabled: !!native,
    version: 1
  };

  if (!native) {
    console.info('[ECDesktop] puente nativo ausente: la app corre como sitio web');
    return;
  }

  window.__EC_DESKTOP__.version = 2;
  console.info(`[ECDesktop] ejecutando como app nativa de escritorio`);
})();