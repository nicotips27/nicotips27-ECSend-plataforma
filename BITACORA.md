# BITÁCORA DEL PROYECTO — ECSend Pro Desktop

**Proyecto:** ECSend Pro — Cliente nativo Windows  
**Empresa:** Estalingrado Corp  
**Repositorio:** https://github.com/nicotips27/ECsendpro-desktop  
**Sitio web de referencia:** https://estalingradocorp.github.io/ECsendpro/  
**Versión actual:** 8.9.1 (sitio web v8.9 + correcciones de escritorio)

---

## ÍNDICE
1. [Visión General](#visión-general)
2. [Cronología de Hitos](#cronología-de-hitos)
3. [Decisiones Técnicas Clave](#decisiones-técnicas-clave)
4. [Arquitectura](#arquitectura)
5. [Bugs Críticos Detectados y Corregidos](#bugs-críticos-detectados-y-corregidos)
6. [Bug Crítico de la Fase 5 — los 35 botones no respondían](#bug-crítico-de-la-fase-5--los-35-botones-no-respondían)
7. [Problemas de Interfaz con la Ventana Nativa](#problemas-de-interfaz-con-la-ventana-nativa)
8. [Métricas de Verificación](#métricas-de-verificación)
9. [Estructura del Proyecto](#estructura-del-proyecto)
10. [Próximos Pasos](#próximos-pasos)
11. [Comandos de Desarrollo](#comandos-de-desarrollo)

---

## VISIÓN GENERAL

**ECSend Pro Desktop** es el cliente nativo de Windows para **ECSend Pro**, una aplicación P2P de transferencia de archivos que funciona enteramente en el navegador (y ahora en escritorio) usando **WebRTC DataChannel** con cifrado DTLS/SRTP de extremo a extremo. No hay servidores intermedios: los archivos viajan directo dispositivo-a-dispositivo.

El sitio web original (`estalingradocorp.github.io/ECsendpro/`) es una SPA de 109 commits desplegada en GitHub Pages. Este proyecto crea un **fork de primera clase** que corre como aplicación nativa Windows (Electron) manteniendo el núcleo P2P **verbatim** del sitio para garantizar interoperabilidad total con la versión web (móvil/escritorio).

**Versión actual:** 8.9.1 — núcleo del sitio web v8.9, parche de escritorio 8.9.1

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
| 2026-10-04 | — | **Fase 5** | 🔴 Los 35 botones `on*` inline estaban bloqueados por la CSP. `script-src-attr 'unsafe-hashes'` + 28 sha256. Auditoría `SMOKE_BUTTONS` |
| 2026-10-04 | — | Documentación | README, BITACORA, CHANGELOG, export de sesión |

### Lección registrada (Fase 5): el bug más caro de la app

El usuario reportó *"todos los botones dentro, como enviar, recargar página, no
funciona"*. **Los 35 handlers `on*` inline del sitio estaban bloqueados por la CSP
de escritorio** que se había agregado en la 8.9.0: declaraba
`script-src 'self' https://cdn.jsdelivr.net` sin hashes, y CSP bloquea los
handlers inline salvo `'unsafe-inline'`, un nonce, o un hash `sha256` **con**
`'unsafe-hashes'`.

| | |
|---|---|
| Síntoma | La app abre, la interfaz se ve completa, ningún botón hace nada |
| Causa | CSP sin `'unsafe-hashes'` bloquea los atributos `on*` del sitio |
| Alcance | 35 handlers: enviar, aceptar, recargar, carpeta, vistas, modales, QR, chat, menú, ajustes |
| Por qué no se vio | El smoke test comprobaba "la ventana carga". La violación de CSP solo se dispara al **hacer clic** |
| Fix | `script-src-attr 'unsafe-hashes'` + sha256 de los 28 handlers únicos |
| Por qué no `'unsafe-inline'` | El sitio mete texto remoto (nombres de archivo del peer, chat) en `innerHTML` sin escapar; con `'unsafe-inline'` un nombre de archivo malicioso ejecutaría script |
| Cobertura nueva | `SMOKE_BUTTONS` en el smoke test + regla en `npm run lint` |

**Verificado además sobre la app instalada 8.9.1** (instalada con el `.exe`, no
desde el repo):

```
instalacion   exit 0  ->  %LOCALAPPDATA%\Programs\ECSendPro\ECSendPro.exe
SMOKE_BUTTONS ok 35 handlers on* (28 unicos), 34 clickados en vivo, 1 por hash, 0 violaciones
SMOKE_DOWNLOAD ok 1344 bytes -> C:\Users\nicot\Downloads\ECSendPRO\
PROBE_CODE ok {"code":"565-604","timer":"178s","qr":"200x200"}
desinstalacion exit 0, sin residuos salvo %APPDATA%\ECSend Pro (ajustes, a propósito)
```

Los clics **reales** (sin stubs, sobre el `index.html` del asar) abren y cierran
el modal de ayuda, el QR y el de privacidad, cambian entre Receiver / Sender /
Start, y regeneran el nombre. Cero errores de consola. El código de 6 dígitos
aparece agrupado `XXX-XXX` (`565-604`), que es como lo formatea `app.js:657`
(`myRawCode.match(/.{1,3}/g).join('-')`) — no es un código de 6 dígitos desnudo.

> Detalle de entorno: el primer `/S` instaló en `%LOCALAPPDATA%\Temp\ECSendProUIFix`
> en vez de `Programs\ECSendPro`. Era una entrada de registro vieja de un
> instalador anterior, no un problema del `.exe` actual: tras desinstalar y
> reinstalar, va a `Programs\ECSendPro`.

**Detalle de implementación que costó tiempo:** los hashes van **entre comillas
simples** (`'sha256-...'`). Sin comillas Chromium descarta cada fuente y solo lo
avisa en consola con *"The source list ... contains an invalid source"* — la app
arranca igual y los botones siguen mudos.

**Segundo arreglo de la Fase 5:** `npm run import:site` revertía en silencio los
ajustes de la Fase 4 (`viewport-fit`, `padding-top: 44px`, `splash`/`dynamic-bg`
con `top-[44px]`), porque se habían hecho a mano sobre el fork y no estaban en
`HTML_EDITS`. Ahora son ediciones con ancla exacta y el `index.html` regenerado
sale **byte a byte idéntico**.

**Lección que se repite:** *un smoke test que solo verifica "la ventana carga" no
detecta que los clics no lleguen a nada.* Por eso ahora el test no solo carga la
página: **hace clic en los 35 handlers** y verifica que cada uno corra.

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

## BUG CRÍTICO DE LA FASE 5 — LOS 35 BOTONES NO RESPONDÍAN

Reporte del usuario: *"todos los botones dentro como enviar recargar página no
funciona"*.

| | |
|---|---|
| Síntoma | La app abre, la interfaz se ve completa, **ningún botón hace nada** |
| Causa | La CSP de escritorio (agregada en la 8.9.0) declaraba `script-src 'self'` sin hashes, y CSP **bloquea los atributos `on*` inline** salvo `'unsafe-inline'`, un nonce, o un hash `sha256` **con** `'unsafe-hashes'` |
| Alcance | Los **35 handlers `on*`** del sitio: enviar, aceptar, recargar página, elegir carpeta, cambiar de vista, cerrar modales, QR, chat, menú, ajustes, enviar mensaje |
| Por qué no lo detectó el smoke test | Comprobaba *"la ventana carga"*. La violación de CSP **solo se dispara al hacer clic** |
| Fix | `script-src-attr 'unsafe-hashes'` + `sha256` de los **28 handlers únicos**, entre comillas simples |
| Por qué no `'unsafe-inline'` | El sitio mete texto remoto (nombres de archivo que envía el peer, mensajes de chat) en `innerHTML` **sin escapar**: con `'unsafe-inline'`, un nombre de archivo malicioso ejecutaría script |

**Trampa de implementación:** los hashes van **entre comillas simples**
(`'sha256-...'`). Sin comillas, Chromium descarta cada fuente y solo lo avisa en
consola con *"The source list ... contains an invalid source"*: la app arranca
igual y los botones siguen mudos. De hecho, en el primer intento se pegaron 10 de
28 hashes sin comillas y el síntoma fue idéntico al bug original.

### Archivos que participan

| Archivo | Papel |
|---|---|
| `src/renderer/index.html` | Meta `Content-Security-Policy` con `script-src-attr 'unsafe-hashes'` + 28 hashes |
| `tools/csp-hashes.mjs` | Escanea el HTML, calcula los `sha256` de los handlers `on*` (decodificando entidades como hace el navegador) y arma la CSP. También `auditCsp()` |
| `tools/import-site.mjs` | Genera la CSP **después** de todas las ediciones, con los hashes del HTML final |
| `tools/lint.mjs` | Falla si algún handler `on*` se queda sin hash, o si vuelve `'unsafe-inline'` a `script-src` |
| `src/main/main.js` | Auditoría `SMOKE_BUTTONS`: hash estático + click real en cada handler con el sitio stubbeado |

### Cómo se verifica que la auditoría tiene dientes

1. Romper la CSP (quitar `script-src-attr`) → `SMOKE_FAIL botones: handler sin
   ejecutar: window.toggleMainMenu(event)`.
2. Restaurar con `npm run import:site` → `SMOKE_BUTTONS ok`.

El único handler que **no** se puede ejercitar en vivo es
`window.location.reload()`: `window.location` es *unforgeable*, así que la
asignación `location.reload = fn` falla **sin lanzar excepción**. El stub lo
detecta comparando el valor después de asignar, en vez de confiar en que la
asignación funcionó. Ese handler queda auditado por hash.

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

El smoke test confirma que el CSS carga, que la app arranca y que **los 35
botones responden**, pero **no puede comprobar que la franja de 44 px se vea
bien**. Eso hay que mirarlo en la pantalla: abrir la app y verificar que el logo,
el título y el splash no queden debajo de los botones de la ventana.

Los modales (`modal-help`, `modal-qr`, `modal-privacy`, `modal-scanner`,
`modal-transfer`, `modal-file-loading`, `modal-chat`) conservan `inset-0` a
propósito: son capas a pantalla completa y deben poder cubrir el área de
contenido.

### La Fase 4 se perdía al reimportar

Estas tres correcciones se hicieron **a mano** sobre el fork, fuera de
`HTML_EDITS`. Consecuencia: `npm run import:site` las borraba en silencio y
volvía el layout roto. Ahora son ediciones con ancla exacta en
`tools/import-site.mjs` (`viewport-fit`, `padding-top: 44px`, `splash` y
`dynamic-bg` con `top-[44px]`) y el `index.html` regenerado sale **byte a byte
idéntico** al que había.

---

## MÉTRICAS DE VERIFICACIÓN (SMOKE TEST ACTUAL)

```
SMOKE_BUTTONS ok 35 handlers on* (28 unicos), 34 clickados en vivo,
                 1 auditados por hash, 34 llamadas, 0 violaciones CSP
SMOKE_DOWNLOAD ok smoke-XXX.txt 1344 bytes -> C:\Users\...\Downloads\ECSendPRO\...
PROBE_CODE ok 3004ms {"code":"565-604","timer":"178s","qr":"200x200"}
SMOKE_OK {
  "url": "app://ecsendpro/index.html",
  "origin": "app://ecsendpro",
  "bridge": true,
  "desktopBridge": true,
  "version": "8.9.1",
  "css": { "ruleCount": 485, "error": null, "hasFontFace": true, "hasTextPrimary": true },
  "fonts": { "inter": true, "bodyFamily": "Inter, sans-serif" },
  "vendor": { "lucide": "object", "peer": "function", "qrious": "function", "html5qrcode": "function", "tsParticles": "object" },
  "appJsRan": true,
  "remoteScripts": []
}
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
│   ├── index.html        # Fork del sitio + CSP (script-src-attr con hashes) + padding titleBarOverlay
│   ├── js/app.js         # COPIA VERBATIM del sitio (núcleo P2P intacto)
│   ├── js/desktop-bridge.js  # Overrides post-app.js + polyfills nativos
│   ├── styles.src.css    # Entrada Tailwind (@import vendor/fonts/inter.css + @tailwind)
│   ├── styles.css        # Salida compilada (33.4 KB, 485 reglas)
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
│   ├── csp-hashes.mjs    # sha256 de los handlers on* del sitio → CSP con 'unsafe-hashes'
│   ├── sync-vendor.mjs   # Baja librerías + fuentes a vendor/
│   ├── build-css.mjs     # Compila Tailwind v3 → styles.css
│   ├── build-icons.mjs   # Genera .ico desde icono/logo.jpg
│   ├── lint.mjs          # Lint + reglas anti-bugs (prohíbe patrones bugs 2 y 3, audita la CSP)
│   ├── smoke.mjs         # Lanza la app y espera SMOKE_OK / SMOKE_FAIL
│   ├── probe-code.mjs    # Sonda opt-in: espera el código de 6 dígitos (necesita internet)
│   └── sync-from-site.mjs# Diff informativo contra sitio (no auto-aplica)
└── .github/workflows/release.yml  # CI: tag v* → build → Release con .exe + latest.yml
```

> La auditoría de botones vive en `src/main/main.js` (`SMOKE_BUTTONS`), porque
> necesita una ventana real de Electron para poder hacer clic. `tools/smoke.mjs`
> solo lanza y espera el veredicto.

---

## PRÓXIMOS PASOS

| Prioridad | Tarea | Detalle |
|-----------|-------|---------|
| 🔴 **Alta** | **Probar los botones a ojo** | El smoke test confirma que los 35 handlers corren, pero no ve el resultado visual: abrir la app y hacer clic en enviar, cambiar de vista, abrir/cerrar modales, QR y chat |
| 🔴 **Alta** | **Verificar a ojo la barra de título** | El smoke test no ve la franja de 44 px. Abrir la app y confirmar que splash/header no quedan bajo los botones nativos |
| 🔴 **Alta** | Probar transferencia real PC ↔ Móvil | Requiere 2 máquinas en misma red. La señalización ya se verificó sola (`PROBE_CODE ok`, código `565-604`), lo que falta es el DataChannel entre dos peers |
| 🟠 **Media** | Firmar instalador | Certificado code-signing EV/OV → elimina SmartScreen "editor desconocido" |
| 🟠 **Media** | Publicar release v8.9.1 | La 8.9.0 nunca se publicó. Tag `v8.9.1` → CI build → GitHub Release con `.exe` + `latest.yml` |
| 🟠 **Media** | Transferir repo a Estalingradocorp | `gh repo transfer` + actualizar `publish.owner` en `electron-builder.yml` |
| 🟠 **Media** | Probar cámara con webcam real | El permission handler y `enumerateDevices` están implementados pero sin hardware verificado |
| 🟢 **Baja** | Drag & drop nativo | `webUtils.getPathForFile` para archivos grandes desde Explorer |
| 🟢 **Baja** | Jump List de Windows | "Nueva transferencia", "Abrir carpeta descargas" en el menú del botón derecho |

### Conocido / deuda técnica

- El sitio mete texto remoto (nombres de archivo del peer, mensajes de chat) en
  `innerHTML` **sin escapar**. La CSP con hashes evita que eso ejecute script,
  pero el texto se renderiza como HTML: un nombre como `<b>x</b>` se vería en
  negrita. Se arregla en el repo del sitio, no en el fork.
- `tools/sync-from-site.mjs` sigue siendo un diff informativo: no propone parches
  automáticos a propósito.

---

## COMANDOS DE DESARROLLO

```bash
# Desarrollo
npm start                    # Arranca en modo dev (con DevTools)
npm run verify               # lint + smoke (lo que hay que correr antes de dist)
npm run lint                 # Sintaxis + reglas anti-bugs + auditoría de la CSP
npm run smoke                # Arranca la app: CSS, fuentes, libs, 35 botones, descarga real
npm run probe:code           # Señalización P2P: espera el código de 6 dígitos (necesita internet)

# Generación de assets
npm run icons                # Baja icono/logo.jpg → build/icon.ico + installerIcon.ico + tray.ico
npm run vendor               # Baja 5 libs + Inter fonts a src/renderer/vendor/
npm run css                  # Compila Tailwind v3 → src/renderer/styles.css

# Sincronización con sitio web
npm run sync                 # Baja sitio a .upstream/ y muestra diff (NO aplica)
npm run import:site          # Re-importa: ediciones exactas + CSP con los hashes de los on*
#                               Tras un reimport, SIEMPRE: npm run css && npm run verify

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
git tag v8.9.1 && git push origin v8.9.1
# → GitHub Actions: build windows-latest → upload .exe + blockmap + latest.yml → Release

# Transferir repo a Estalingradocorp (cuando haya certificado)
gh repo transfer nicotips27/ECsendpro-desktop Estalingradocorp
# Luego: editar electron-builder.yml → publish.owner: Estalingradocorp
```

---

## NOTAS PARA EL EQUIPO

1. **El núcleo P2P NO se toca.** `src/renderer/js/app.js` entra **verbatim** del sitio. Cualquier cambio en la lógica de transferencia, código QR, chat, descubrimiento, etc. se hace en el repo del sitio (`Estalingradocorp/ECsendpro`) y se trae con `npm run import:site`.

2. **El fork es de primera clase.** `tools/import-site.mjs` usa anclas exactas y **aborta si el sitio cambió algo**, para no dejar el fork roto en silencio. `tools/sync-from-site.mjs` solo muestra el diff para revisión manual.

3. **El smoke test es la verdad.** Si `npm run smoke` pasa, la app arranca, carga CSS, fuentes, librerías, corre `app.js`, **ejecuta los 35 handlers `on*`** (clic real con el sitio stubbeado) y **escribe un archivo real en disco**. Si falla, algo está roto. Y si alguna vez pasó con la app rota, es porque faltaba una de esas cuatro cosas: no confíes solo en "carga".

4. **La CSP se genera, no se escribe a mano.** `tools/csp-hashes.mjs` calcula el `sha256` de los handlers `on*` del sitio y `import-site` los mete en `script-src-attr 'unsafe-hashes'`. Si agregas un botón al sitio hay que reimportar; si alguien mete `'unsafe-inline'` a mano, `npm run lint` lo rechaza.

5. **SmartScreen es esperado.** El instalador no está firmado. Windows mostrará "Editor desconocido" → "Ejecutar de todas formas". Para eliminarlo hace falta certificado code-signing EV/OV ($200-400/año).

6. **Interoperabilidad garantizada.** Mismo código de 6 dígitos, mismo `peerId` (`ecsend-XXXXXX`), mismo room Trystero (`ecsend-net-a.b.c`). El móvil en la web y la PC en la app se conectan igual.

---

*Bitácora generada el 2026-10-03, actualizada el 2026-10-04 (Fase 5). Actualizar en cada hito relevante.*