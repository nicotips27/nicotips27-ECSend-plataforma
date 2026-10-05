# Changelog — ECSend Pro Desktop

Todas las novedades de la app de escritorio de ECSend Pro para Windows.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el
versionado es [SemVer](https://semver.org/lang/es/).

La versión acompaña a la del sitio web (`Estalingradocorp/ECsendpro`).

---

## [No publicado]

### Pendiente
- La **8.9.0 nunca se publicó en GitHub Releases** (falta token válido de
  `Estalingradocorp`). La 8.9.1 supersede a la 8.9.0: publicar `v8.9.1`.

---

## [8.9.1] — 2026-10-04

> La 8.9.0 se instaló pero quedó con dos defectos que el usuario reportaba. Esta
> versión es la primera instalable de verdad.

### Corregido
- **Barra de título nativa tapaba la interfaz** (dos correcciones sucesivas):
  - `viewport-fit=cover` eliminado del `viewport`; hacía que el contenido se
    metiera bajo la barra nativa de 44 px.
  - `padding-top` del `body` hardcodeado a 44 px. La función `env(titlebar-area-y)`
    solo existe en iOS Safari: en Windows devolvía su valor de reserva y el
    contenido quedaba bajo los botones de cerrar/minimizar/maximizar.
  - `splash` y `dynamic-bg` pasaron de `inset-0` a `top-[44px]`.
- 🔴 **CRÍTICO — ningún botón de la app respondía.** El sitio de ECSend Pro
  usa **35 atributos `on*` inline** (`onclick`, `onsubmit`, `onkeypress`): enviar,
  aceptar, recargar página, elegir carpeta, cambiar de vista, cerrar modales, QR,
  chat, menú, ajustes. La CSP de escritorio que se agregó en la 8.9.0 declaraba
  `script-src 'self' https://cdn.jsdelivr.net` **sin hashes**, así que Chromium
  **bloqueaba los 35 handlers en silencio**: la app arrancaba, la interfaz se ve
  completa, y al hacer clic no pasaba absolutamente nada.

  **Causa:** CSP bloquea los handlers inline salvo que la fuente incluya
  `'unsafe-inline'`, un nonce, o un hash `sha256` **con** `'unsafe-hashes'`.

  **Fix:** `script-src-attr 'unsafe-hashes'` con el `sha256` de los 28 handlers
  únicos del sitio. Se eligió hashes y no `'unsafe-inline'` a propósito: el sitio
  mete texto remoto (nombres de archivo que envía el peer, mensajes de chat) en
  `innerHTML` sin escapar, así que con `'unsafe-inline'` un nombre de archivo
  malicioso podría ejecutar script. Con hashes solo corre el código que el sitio
  ya trae escrito.

  **Cómo se detectó:** un smoke test que solo comprueba "la ventana carga" no lo
  ve, porque la violación de CSP solo se dispara al hacer clic. Se reprodujo
  primero (35 handlers, `blocked` en todos) y después se arregló.

- `npm run import:site` **ya no rompe el layout de escritorio.** Las correcciones
  de la 8.9.0 (quitar `viewport-fit=cover`, `padding-top: 44px`, `splash` y
  `dynamic-bg` con `top-[44px]`) se habían hecho a mano sobre el fork: un
  reimport las borraba en silencio. Ahora son ediciones con ancla exacta en
  `tools/import-site.mjs`, y el `index.html` sale **byte a byte idéntico** al
  que se tenía.

### Agregado
- **`SMOKE_BUTTONS` en el smoke test.** Recorre los 35 handlers `on*` de la
  página: primero comprueba que cada uno tenga su `sha256` en la CSP, después
  **dispara el evento real de cada uno** (con las funciones del sitio
  stubbeadas, para no abrir diálogos ni navegar) y verifica que el handler haya
  corrido. El único que no se puede stubbear es `window.location.reload()`
  (`location` es *unforgeable*), y queda auditado por hash.
  Resultado actual: `SMOKE_BUTTONS ok 35 handlers on* (28 unicos), 34 clickados
  en vivo, 1 auditados por hash, 34 llamadas, 0 violaciones CSP`.
  Verificado que **falla** si se rompe la CSP, que es justo el bug que pasó
  desapercibido en la 8.9.0.
- **CI de releases en `.github/workflows/release.yml`.** El directorio estaba
  **vacío**: el README y la bitácora afirmaban que existía. Ahora un tag `v*`
  dispara `npm ci` → postinstall de Electron → `icons` → `css` → **`lint` (que
  audita la CSP)** → **`smoke` (que hace clic en los 35 botones)** → instalador
  con `--publish always`. Si algo falla, sube `.exe`, `.blockmap` y `latest.yml`
  como artefactos.
- **Mensaje claro cuando ya hay otra instancia corriendo.** La app instalada y
  la de desarrollo comparten `userData` (las dos se llaman "ECSend Pro"), así que
  el cerrojo de instancia única también las excluye entre sí. La segunda salía
  con código 0 **sin decir nada**: en el smoke test parecía que todo estaba bien
  y en la vida real parecía que la app no arrancaba. Ahora lo dice, y en modo
  smoke falla con `SMOKE_FAIL otra instancia de ECSend Pro ya esta corriendo`.
  Es uno de los diagnósticos más confusos que aparecen al instalar y probar en la
  misma máquina, y salió justo de hacer eso.
- `tools/csp-hashes.mjs`: escanea el HTML, calcula los `sha256` de los handlers
  inline (decodificando entidades HTML, como hace el navegador) y arma la CSP.
  Lo usan `import-site` y `lint`.
- `npm run lint` ahora falla si algún handler `on*` se queda sin hash en la CSP, o
  si alguien reintroduce `'unsafe-inline'` en `script-src`.
- `npm run probe:code`: sonda **opt-in** de señalización P2P. Levanta la app y
  espera a que el sitio complete el handshake con PeerJS Cloud y publique el
  código de 6 dígitos, el QR y el temporizador rotativo.
  ```
  PROBE_CODE ok 3001ms {"code":"832-458","timer":"178s","qr":"200x200"}
  ```
  Verificado sobre la app instalada: `PROBE_CODE ok 3004ms {"code":"565-604",...}`.
  **No está en el smoke test a propósito**: necesita internet, y en una máquina
  sin red fallaría por el motivo equivocado.

---

## [8.9.0] — 2026-10-03

Primera versión del programa nativo de Windows. Instala, arranca y transfiere.

### Agregado
- **App de escritorio Electron** con el núcleo P2P del sitio web importado
  **verbatim**: WebRTC DataChannel, códigos de 6 dígitos rotativos, QR, chat
  cifrado, descubrimiento en red y envío en lote.
- **Esquema `app://ecsendpro`** privilegiado en lugar de `file://`. Sin esto
  `localStorage` e IndexedDB quedan en un origen opaco y los ajustes y el
  historial se pierden en cada reinicio.
- **Instalador NSIS** en español, por usuario, con atajos de Escritorio y Menú
  Inicio, elección de carpeta y desinstalación limpia.
- **Identidad Estalingrado Corp:** íconos `.ico` de 7 resoluciones generados
  desde `icono/logo.jpg`, `tray.ico` separado para la bandeja, splash con el
  logo, y se mantiene la publicidad de Estalingrado Market.
- **Vendor offline completo:** lucide, peerjs, qrious, html5-qrcode,
  tsparticles-slim e Inter (5 pesos, subset latin). La app abre y funciona sin
  internet.
- **Tailwind v3.4 compilado** a `styles.css` (33.4 KB, 484 reglas), con
  `safelist` para las 6 variables de clase que en `app.js` solo existen
  interpoladas en plantillas.
- **CSP de escritorio** (`script-src 'self' https://cdn.jsdelivr.net`): la app
  no carga ningún `<script>` remoto salvo Trystero, que se importa por
  `import()` dinámico y no tiene bundle standalone.
- **Descargas nativas:** `session.on('will-download')` intercepta y escribe en
  una carpeta configurable (`Documentos/ECSendPRO` por defecto), con dedupe
  `(1)`, progreso por IPC y notificación nativa al completar.
- **Cámara/QR:** permiso de media auto-aceptado y `enumerateDevices` en el
  renderer para reemplazar el `facingMode` del sitio, que Electron no soporta.
- **Bandeja del sistema**, instancia única, revelar en Explorador y abrir
  carpeta.
- **`npm run verify`** (`lint` + `smoke`): el smoke test valida origen `app://`,
  CSS compilado, fuente Inter, las 5 librerías en el renderer, que `app.js`
  corrió, que no queden scripts remotos, que no haya violaciones de CSP y
  **que un archivo real llegue al disco**.

### Corregido
Cinco bugs detectados en una auditoría del código, ninguno cubierto por el
smoke test original:

1. **CRÍTICO — la carpeta de descargas nunca se creaba.** `getDownloadFolder()`
   devolvía `Documentos/ECSendPRO` sin crearla; `will-download` escribía con
   `setSavePath()` sobre un directorio inexistente y **la descarga fallaba en
   silencio**: el usuario veía el archivo como recibido y no aparecía en disco.
   Ahora `ensureDownloadFolder()` la crea al arrancar y antes de cada descarga.
2. **CRÍTICO — `window.downloadDirHandle` era un getter sin setter.** El sitio
   usa su propia variable local (`app.js:544`) y asigna en `app.js:612`, con lo
   cual la asignación fallaba en silencio. Además el handle se guardaba en
   IndexedDB conteniendo funciones → `DataCloneError` y el toast "Error al
   seleccionar carpeta". Se eliminaron los handles falsos.
3. **CRÍTICO — un `Blob` viajaba por `ipcRenderer.invoke`.** No es clonable por
   IPC (`DataCloneError`) y ese camino estaba muerto: `will-download` ya resuelve
   la escritura. Se eliminó el handler.
4. **ALTO — overrides puestos antes de `app.js`.** Los scripts diferidos se
   ejecutan en orden de documento, así que `app.js` pisaba
   `selectDownloadFolder` y `clearDownloadPath`. Ahora se aplican después, en
   `DOMContentLoaded`.
5. **ALTO — `build/` no estaba en el asar.** La app instalada arrancaba sin
   ícono de ventana ni de bandeja. Resuelto con `extraResources`.

### Decisiones técnicas
- **Tailwind v3.4, no v4.** El sitio corre sobre Play CDN v3 y tiene 59 usos de
  `border` sin color explícito más un `shadow-sm`. En v4 el color de borde por
  defecto pasa a `currentColor` y `shadow-sm` pasa a `shadow-xs`: migrar
  habría cambiado el diseño en silencio.
- **Fork de primera clase, no parches.** `tools/import-site.mjs` aplica las
  sustituciones con anclas exactas y **aborta** si el sitio cambió algo, para no
  dejar el fork roto en silencio. `tools/sync-from-site.mjs` solo muestra el
  diff.
- **Trystero sigue remoto a propósito.** No tiene bundle standalone y sus
  relays nostr son servidores ajenos: el descubrimiento ya requiere internet
  por diseño (ARCHITECTURE.md §12 del sitio).

### Conocido
- El instalador no está firmado: Windows SmartScreen muestra "editor
  desconocido". Requiere un code-signing certificate EV/OV para eliminarlo.
- La transferencia P2P real entre dos máquinas sigue sin verificación
  automatizada: requiere hardware en la misma red.
- El repo está bajo `nicotips27`; al transferirlo a `Estalingradocorp` hay que
  actualizar `publish.owner` en `electron-builder.yml`.
- La cámara no se ha probado con un dispositivo real en el entorno de build.

[No publicado]: https://github.com/nicotips27/nicotips27-ECSend-plataforma/compare/5d16e27...HEAD
[8.9.1]: https://github.com/nicotips27/nicotips27-ECSend-plataforma/releases/tag/v8.9.1
[8.9.0]: https://github.com/nicotips27/nicotips27-ECSend-plataforma/releases/tag/v8.9.0
