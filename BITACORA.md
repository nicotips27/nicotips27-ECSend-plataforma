# BITÁCORA DEL PROYECTO — ECSend Pro Desktop

**Proyecto:** ECSend Pro — Cliente nativo Windows  
**Empresa:** Estalingrado Corp  
**Repositorio:** https://github.com/nicotips27/ECsendpro-desktop  
**Sitio web de referencia:** https://estalingradocorp.github.io/ECsendpro/  
**Versión actual:** 8.9.0 (alineada con el sitio web)

---

## ÍNDICE
1. [Visión General](#visión-general)
2. [Cronología de Hitos](#cronología-de-hitos)
3. [Decisiones Técnicas Clave](#decisiones-técnicas-clave)
4. [Arquitectura](#arquitectura)
5. [Bugs Críticos Detectados y Corregidos](#bugs-críticos-detectados-y-corregidos)
6. [Problemas de Interfaz con la Ventana Nativa](#problemas-de-interfaz-con-la-ventana-nativa)
7. [Métricas de Verificación](#métricas-de-verificación)
8. [Estructura del Proyecto](#estructura-del-proyecto)
9. [Próximos Pasos](#próximos-pasos)
10. [Comandos de Desarrollo](#comandos-de-desarrollo)

---

## VISIÓN GENERAL

**ECSend Pro Desktop** es el cliente nativo de Windows para **ECSend Pro**, una aplicación P2P de transferencia de archivos que funciona enteramente en el navegador (y ahora en escritorio) usando **WebRTC DataChannel** con cifrado DTLS/SRTP de extremo a extremo. No hay servidores intermedios: los archivos viajan directo dispositivo-a-dispositivo.

El sitio web original (`estalingradocorp.github.io/ECsendpro/`) es una SPA de 109 commits desplegada en GitHub Pages. Este proyecto crea un **fork de primera clase** que corre como aplicación nativa Windows (Electron) manteniendo el núcleo P2P **verbatim** del sitio para garantizar interoperabilidad total con la versión web (móvil/escritorio).

**Versión actual:** 8.9.0 (sincronizada con el sitio web v8.9)

---

## CRONOLOGÍA DE HITOS

| Fecha | Commit | Hito | Detalle |
|-------|--------|------|---------|
| 2026-10-03 | — | Inicio del proyecto | Definición de alcance, stack, repo, decisiones iniciales |
| 2026-10-03 | `095c4b6` | **Fase 1** | Esqueleto Electron: ventana, protocolo `app://`, iconos, instalador NSIS |
| 2026-10-03 | `1d63df4` | Identidad | Logo e iconos de Estalingrado Corp en toda la app |
| 2026-10-03 | `3fcaae1` | **Fase 2** | Vendor offline (5 libs + Inter), Tailwind v3 compilado, CSP, import-site |
| 2026-10-03 | `a1ef643` | **Fase 3** | Adaptaciones nativas (cámara, descargas, ajustes) — con bugs |
| 2026-10-03 | `539e582` | **Auditoría** | 5 bugs críticos corregidos + lint anti-patrones + descarga real en smoke |
| 2026-10-03 | `fb2b865` | **Fase 4** (intento 1) | `padding-top` con `env()` — no funcionó en Windows |
| 2026-10-03 | `5d16e27` | **Fase 4** (intento 2) | `viewport-fit=cover` fuera, padding 44px fijo, splash `top-[44px]` |
| 2026-10-03 | — | Documentación | README, BITACORA, CHANGELOG, export de sesión |

### Lección registrada (Fase 4)

El primer fix del `titleBarOverlay` usó `padding-top: env(titlebar-area-y, 44px)`.
**`env(titlebar-area-*)` es una función de iOS Safari y no existe en Chromium de
escritorio**: devolvía el valor de reserva y el contenido quedaba igual de mal.
La causa real era doble —`viewport-fit=cover` empujaba el contenido bajo la barra
nativa, y el `padding` nunca aplicó— así que hizo falta quitar el `viewport-fit`,
poner el padding en píxeles fijos y bajar el `splash` a `top-[44px]`.

También queda como lección: **un smoke test que solo verifica "la ventana carga" no
detecta que las descargas fallen**. Por eso ahora el test exige que un archivo
real llegue al disco (`SMOKE_DOWNLOAD`).

---

## DECISIONES TÉCNICAS CLAVE

| Tema | Decisión | Justificación |
|------|----------|---------------|
| **Stack** | Electron 44.5.1 + electron-builder | Reutiliza HTML/JS/CSS del sitio ~100%; Node ya instalado |
| **Protocolo** | `app://ecsendpro/` privilegiado | `file://` da origen opaco → `localStorage`/`IndexedDB` se pierden al reiniciar |
| **Tailwind** | **v3.4** (NO v4) | Sitio en Play CDN v3; 59 `border` sin color + 1 `shadow-sm` → en v4 cambian semánticas (borde→`currentColor`, `shadow-sm`→`shadow-xs`) |
| **CDN** | Vendor offline total (5 libs + Inter) | App funciona offline; solo Trystero remoto (sus relays nostr son remotos por diseño) |
| **Descargas** | `will-download` + carpeta configurable | `showDirectoryPicker` no existe en Electron; un solo camino via `<a download>` |
| **Instalador** | NSIS `.exe` sin firmar | Gratis, inmediato; SmartScreen avisa "editor desconocido" |
| **Auto-actualización** | electron-updater → GitHub Releases | `publish.owner: nicotips27` (luego transferible a Estalingradocorp) |
| **Sitio web** | **No se toca** | 109 commits intactos; cero riesgo para producción |

---

## ARQUITECTURA

```
┌─ main ──────────────────────────────────────────────┐
│ protocol.js   app:// (origen estable → localStorage OK)│
│ downloads.js  session.will-download → carpeta fija,   │
│               dedupe "(1)", progreso → IPC           │
│ settings.js   settings.json en userData               │
│ ipc.js        choose-folder · save-received · reveal   │
│ tray.js       bandeja + single-instance + notificaciones│
│ updater.js    electron-updater → GitHub releases      │
└──────── preload (contextIsolation, sandbox) ──────────┘
┌─ renderer (fork de primera clase del sitio) ─────────┐
│ index.html · app.js · styles.css (Tailwind compilado)│
│ desktop-bridge.js → window.ECDesktop                │
│ vendor/  lucide · qrious · html5-qrcode · peerjs ·    │
│          tsparticles (todo local, funciona offline) │
└──────────────────────────────────────────────────────┘
```

**Flujo de descargas (crítico):**
1. Sitio recibe archivo por WebRTC → reconstruye `Blob`
2. Dispara `<a href="blob:..." download="...">` click
3. Electron `session.on('will-download')` intercepta
4. `ensureDownloadFolder()` crea `Documentos/ECSendPRO` si no existe
4. `item.setSavePath(carpeta/archivo)` → dedupe `(1)` si existe
5. Progreso → IPC `download:progress` → UI
6. Completado → `download:completed` → notificación nativa + toast

---

## BUGS CRÍTICOS DETECTADOS Y CORREGIDOS (AUDITORÍA FASE 3)

> **Importante:** Estos bugs no los detectó el smoke test original (solo verificaba que la ventana cargara). Se encontraron en una **auditoría manual de código** al revisar el trabajo previo.

| # | Gravedad | Bug | Consecuencia | Fix |
|---|----------|-----|--------------|-----|
| 1 | 🔴 **Crítico** | `getDownloadFolder()` nunca creaba la carpeta | `will-download` hacía `setSavePath()` a directorio inexistente → descarga fallaba **en silencio**; usuario veía "recibido" pero archivo no aparecía en disco | `ensureDownloadFolder()` al arrancar + antes de cada descarga |
| 2 | 🔴 **Crítico** | `window.downloadDirHandle` getter **sin setter** | Sitio asigna `downloadDirHandle = ...` (app.js:612) → fallo silencioso; handle con funciones → `DataCloneError` en IndexedDB → toast "Error al seleccionar carpeta" | Eliminados handles falsos; sitio usa `<a download>` nativo; `will-download` resuelve todo |
| 3 | 🔴 **Crítico** | `save-received` pasaba **Blob por IPC** | `ipcRenderer.invoke` no admite Blob → `DataCloneError`; camino muerto duplicaba escritura | Eliminado: `will-download` ya resuelve todo |
| 4 | 🟠 **Alto** | Overrides `selectDownloadFolder` puestos **antes** de `app.js` | `defer` se ejecuta en orden de documento → `app.js` pisaba los overrides → código muerto | Overrides aplicados **después** en `DOMContentLoaded` |
| 5 | 🟠 **Alto** | `build/` no en asar | App instalada arrancaba **sin icono** de ventana ni bandeja | `extraResources` con `build/*.ico` en electron-builder |

> **Lección:** El smoke test original solo verificaba que la ventana cargara. Ahora el test exige **descarga real a disco** (`SMOKE_DOWNLOAD`) y falla si el archivo no llega al disco.

---

## PROBLEMAS DE INTERFAZ CON LA VENTANA NATIVA

Reporte del usuario: *"la ventana estorba la interfaz del sitio"* y *"los botones
de cerrar/minimizar/cambiar tamaño siguen interfiriendo, la interfaz está
incompleta"*.

### Causa 1 — `viewport-fit=cover`
La app móvil del sitio declara `viewport-fit=cover`, pensado para el notch del
iPhone. En Electron eso empuja el contenido **hacia arriba**, debajo de la barra
de título nativa de 44 px.

**Fix:** quitar `viewport-fit=cover` del `<meta name="viewport">`.

### Causa 2 — `env(titlebar-area-y)` no existe en Windows
El primer intento usó `padding-top: env(titlebar-area-y, 44px)`.
**Las variables `env(titlebar-area-*)` son exclusivas de iOS Safari**: en Chromium
de escritorio la función no existe, así que devolvía el valor de reserva y el
`padding` nunca surtió efecto.

**Fix:** `padding-top: 44px` en píxeles fijos.

### Causa 3 — `fixed inset-0` en el splash
`#splash` y `#dynamic-bg` usaban `inset-0`, que cubre desde y=0 y por lo tanto
pintaba encima de la zona de la barra nativa.

**Fix:** `top-[44px]` en ambos, dejando la franja superior limpia para los
botones del sistema.

### Verificación pendiente de eyesight

El smoke test confirma que el CSS carga y que la app arranca, pero **no puede
comprobar que la franja de 44 px se vea bien**. Eso hay que mirarlo en la
pantalla: abrir la app y verificar que el logo, el título y el splash no queden
debajo de los botones de la ventana.

Los modales (`modal-help`, `modal-qr`, `modal-privacy`, `modal-scanner`,
`modal-transfer`, `modal-file-loading`, `modal-chat`) conservan `inset-0` a
propósito: son capas a pantalla completa y deben poder cubrir el área de
contenido.

---

## MÉTRICAS DE VERIFICACIÓN (SMOKE TEST ACTUAL)

```
SMOKE_OK {
  "url": "app://ecsendpro/index.html",
  "origin": "app://ecsendpro",
  "bridge": true,
  "desktopBridge": true,
  "css": { "ruleCount": 484, "error": null, "hasFontFace": true, "hasTextPrimary": true },
  "fonts": { "inter": true, "bodyFamily": "Inter, sans-serif" },
  "vendor": { "lucide": "object", "peer": "function", "qrious": "function", "html5qrcode": "function", "tsParticles": "object" },
  "appJsRan": true,
  "remoteScripts": []
}
SMOKE_DOWNLOAD ok smoke-XXX.txt 1344 bytes -> C:\Users\...\Downloads\ECSendPRO\...
0 violaciones CSP · 0 errores de consola · 0 scripts remotos
```

---

## ESTRUCTURA DEL PROYECTO

```
ECsendpro-desktop/
├── src/main/
│   ├── main.js           # Proceso principal, ventana, protocolo, IPC, tray, updater
│   ├── protocol.js       # app:// esquema privilegiado (origen estable)
│   ├── downloads.js      # will-download, carpeta configurable, eventos progreso
│   └── index.d.ts        # (si aplica)
├── src/preload/
│   └── preload.js        # contextBridge → window.ECDesktop (downloads, cameras, notify, shell)
├── src/renderer/
│   ├── index.html        # Fork del sitio + CSP + padding titleBarOverlay
│   ├── js/app.js         # COPIA VERBATIM del sitio (núcleo P2P intacto)
│   ├── js/desktop-bridge.js  # Overrides post-app.js + polyfills nativos
│   ├── styles.src.css    # Entrada Tailwind (@import vendor/fonts/inter.css + @tailwind)
│   ├── styles.css        # Salida compilada (33.4 KB, 484 reglas)
│   └── vendor/
│       ├── lucide.min.js
│       ├── peerjs.min.js
│       ├── qrious.min.js
│       ├── html5-qrcode.min.js
│       ├── tsparticles.slim.bundle.min.js
│       └── fonts/
│           ├── inter-400.woff2 ... inter-800.woff2
│           └── inter.css
├── build/
│   ├── icon.ico          # Ventana + acceso directo (16-256px)
│   ├── installerIcon.ico # Instalador NSIS
│   └── tray.ico          # Bandeja (16-64px)
├── tailwind.config.js    # Config v3 + colores + animaciones + safelist (6 variables)
├── electron-builder.yml  # NSIS español, extraResources build/, publish GitHub
├── package.json          # Scripts: start, vendor, css, icons, import:site, lint, smoke, dist
├── tools/
│   ├── import-site.mjs   # Re-importa sitio con anclas EXACTAS (aborta si cambió)
│   ├── sync-vendor.mjs   # Baja librerías + fuentes a vendor/
│   ├── build-css.mjs     # Compila Tailwind v3 → styles.css
│   ├── build-icons.mjs   # Genera .ico desde icono/logo.jpg
│   ├── lint.mjs          # Lint + reglas anti-bugs (prohíbe patrones bugs 2 y 3)
│   ├── smoke.mjs         # Verifica app://, CSS, fuentes, libs, descarga real a disco
│   └── sync-from-site.mjs# Diff informativo contra sitio (no auto-aplica)
└── .github/workflows/release.yml  # CI: tag v* → build → Release con .exe + latest.yml
```

---

## PRÓXIMOS PASOS

| Prioridad | Tarea | Detalle |
|-----------|-------|---------|
| 🔴 **Alta** | **Verificar a ojo la barra de título** | El smoke test no ve la franja de 44 px. Abrir la app y confirmar que splash/header no quedan bajo los botones nativos |
| 🔴 **Alta** | Probar transferencia real PC ↔ Móvil | Requiere 2 máquinas en misma red; validar handshake LAN + QR + botón "Aceptar" |
| 🟠 **Media** | Firmar instalador | Certificado code-signing EV/OV → elimina SmartScreen "editor desconocido" |
| 🟠 **Media** | Publicar release v8.9.0 | Tag `v8.9.0` → CI build → GitHub Release con `.exe` + `latest.yml` |
| 🟠 **Media** | Transferir repo a Estalingradocorp | `gh repo transfer` + actualizar `publish.owner` en `electron-builder.yml` |
| 🟠 **Media** | Probar cámara con webcam real | El permission handler y `enumerateDevices` están implementados pero sin hardware verificado |
| 🟢 **Baja** | Drag & drop nativo | `webUtils.getPathForFile` para archivos grandes desde Explorer |
| 🟢 **Baja** | Jump List de Windows | "Nueva transferencia", "Abrir carpeta descargas" en el menú del botón derecho |

---

## COMANDOS DE DESARROLLO

```bash
# Desarrollo
npm start                    # Arranca en modo dev (con DevTools)
npm run lint                 # Sintaxis + reglas anti-bugs (5 archivos + patrones prohibidos)
npm run smoke                # Smoke test completo (app:// + CSS + fuentes + libs + descarga real)

# Generación de assets
npm run icons                # Baja icono/logo.jpg → build/icon.ico + installerIcon.ico + tray.ico
npm run vendor               # Baja 5 libs + Inter fonts a src/renderer/vendor/
npm run css                  # Compila Tailwind v3 → src/renderer/styles.css

# Sincronización con sitio web
npm run sync                 # Baja sitio a .upstream/ y muestra diff (NO aplica)
npm run import:site          # Re-importa sitio aplicando ediciones exactas (aborta si cambió)

# Empaquetado
npm run dist                 # Instalador NSIS en dist/ (con blockmap + latest.yml)
npm run dist:dir             # Solo carpeta win-unpacked (para probar sin instalar)

# Verificación instalada
node tools/smoke.mjs dist/win-unpacked/ECSendPro.exe
```

---

## COMANDOS GIT / CI

```bash
# Commit convencional
git add -A && git commit -m "tipo(ámbito): mensaje"

# Release (tag dispara CI)
git tag v8.9.0 && git push origin v8.9.0
# → GitHub Actions: build windows-latest → upload .exe + blockmap + latest.yml → Release

# Transferir repo a Estalingradocorp (cuando haya certificado)
gh repo transfer nicotips27/ECsendpro-desktop Estalingradocorp
# Luego: editar electron-builder.yml → publish.owner: Estalingradocorp
```

---

## NOTAS PARA EL EQUIPO

1. **El núcleo P2P NO se toca.** `src/renderer/js/app.js` entra **verbatim** del sitio. Cualquier cambio en la lógica de transferencia, código QR, chat, descubrimiento, etc. se hace en el repo del sitio (`Estalingradocorp/ECsendpro`) y se trae con `npm run import:site`.

2. **El fork es de primera clase.** `tools/import-site.mjs` usa anclas exactas y **aborta si el sitio cambió algo**, para no dejar el fork roto en silencio. `tools/sync-from-site.mjs` solo muestra el diff para revisión manual.

3. **El smoke test es la verdad.** Si `npm run smoke` pasa, la app arranca, carga CSS, fuentes, librerías, corre `app.js`, y **escribe un archivo real en disco**. Si falla, algo está roto.

4. **SmartScreen es esperado.** El instalador no está firmado. Windows mostrará "Editor desconocido" → "Ejecutar de todas formas". Para eliminarlo hace falta certificado code-signing EV/OV ($200-400/año).

5. **Interoperabilidad garantizada.** Mismo código de 6 dígitos, mismo `peerId` (`ecsend-XXXXXX`), mismo room Trystero (`ecsend-net-a.b.c`). El móvil en la web y la PC en la app se conectan igual.

---

*Bitácora generada el 2026-10-03. Actualizar en cada hito relevante.*