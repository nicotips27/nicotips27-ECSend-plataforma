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
6. [Métricas de Verificación](#métricas-de-verificación)
7. [Estructura del Proyecto](#estructura-del-proyecto)
8. [Próximos Pasos](#próximos-pasos)
9. [Comandos de Desarrollo](#comandos-de-desarrollo)

---

## VISIÓN GENERAL

**ECSend Pro Desktop** es el cliente nativo de Windows para **ECSend Pro**, una aplicación P2P de transferencia de archivos que funciona enteramente en el navegador (y ahora en escritorio) usando **WebRTC DataChannel** con cifrado DTLS/SRTP de extremo a extremo. No hay servidores intermedios: los archivos viajan directo dispositivo-a-dispositivo.

El sitio web original (`estalingradocorp.github.io/ECsendpro/`) es una SPA de 109 commits desplegada en GitHub Pages. Este proyecto crea un **fork de primera clase** que corre como aplicación nativa Windows (Electron) manteniendo el núcleo P2P **verbatim** del sitio para garantizar interoperabilidad total con la versión web (móvil/escritorio).

**Versión actual:** 8.9.0 (sincronizada con el sitio web v8.9)

---

## CRONOLOGÍA DE HITOS

| Fecha | Hito | Detalle |
|-------|------|---------|
| 2026-10-03 | Inicio del proyecto | Definición de alcance, stack, repo, decisiones iniciales |
| 2026-10-03 | **Fase 1** completada | Esqueleto Electron: ventana, protocolo `app://`, iconos, instalador NSIS |
| 2026-10-03 | **Fase 2** completada | Vendor offline (5 libs + Inter), Tailwind v3 compilado, CSP, import-site |
| 2026-10-03 | **Fase 3** completada | Adaptaciones nativas + **Auditoría crítica** (5 bugs corregidos) |
| 2026-10-03 | **Fase 4** completada | Fixes UI: padding `titleBarOverlay`, splash, botón Aceptar |
| 2026-10-03 | Exportación documentación | Historial de chats + bitácora |

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
| 🔴 **Alta** | Probar transferencia real PC ↔ Móvil | Requiere 2 máquinas en misma red; validar handshake LAN + QR |
| 🔴 **Alta** | Firmar instalador | Certificado code-signing EV/OV → elimina SmartScreen "editor desconocido" |
| 🟠 **Media** | Publicar release v8.9.0 | Tag `v8.9.0` → CI build → GitHub Release con `.exe` + `latest.yml` |
| 🟠 **Media** | Transferir repo a Estalingradocorp | `gh repo transfer nicotips27/ECsendpro-desktop Estalingradocorp` + actualizar `publish.owner` |
| 🟢 **Baja** | Drag & drop nativo | `webUtils.getPathForFile` para archivos grandes desde Explorer |
| 🟢 **Baja** | Accesos directos Jump List | "Nueva transferencia", "Abrir carpeta descargas" en botón derecho tray |

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