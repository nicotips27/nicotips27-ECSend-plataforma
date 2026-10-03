# ECSend Pro — Windows

Programa nativo de escritorio para **ECSend Pro**, la app P2P de transferencia de archivos de [Estalingrado Corp](https://estalingradocorp.github.io/ECsendpro/).

Los archivos viajan directo de un dispositivo a otro por **WebRTC DataChannel** (cifrado DTLS/SRTP). No pasa nada por servidores de la app.

- **Sitio web:** https://estalingradocorp.github.io/ECsendpro/
- **Empresa:** Estalingrado Corp
- **Licencia:** MIT

## Estado

Fase 2 completa: el sitio web ya corre dentro del programa de escritorio, sin
depender de ningun CDN. Falta portar el comportamiento nativo (descargas, ajustes, camara).

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Repo, ventana oscura, protocolo `app://`, íconos, instalador NSIS | ✅ |
| 2 | Dependencias vendorizadas + Tailwind compilado + CSP | ✅ |
| 3 | Port del núcleo P2P (código, QR, DataChannel, chat, descubrimiento) | ⏳ |
| 4 | Descargas, ajustes, cámara + integración nativa | ⏳ |
| 5 | Identidad Estalingrado Corp | ⏳ |
| 6 | Auto-actualización + CI de releases | ⏳ |
| 7 | Docs y herramienta de sincronización con el sitio | parcial |

> `app.js` se importa **verbatim** del sitio: el núcleo P2P ya funciona dentro de
> Electron sin tocar una línea. La Fase 3 es verificación en dos máquinas reales,
> no reescritura.

## Arquitectura

```
src/main/       proceso principal (ventana, protocolo, descargas, ajustes, bandeja, updater)
src/preload/    puente contextBridge -> window.ECDesktop
src/renderer/   interfaz (fork de primera clase del sitio web)
  index.html    importado del sitio, con las diferencias de escritorio aplicadas
  js/app.js     copia verbatim de js/app.js del sitio
  js/desktop-bridge.js   capa donde se enchufan las APIs nativas
  styles.src.css entrada de Tailwind
  styles.css    salida compilada (generada, se commitea)
  vendor/       lucide, peerjs, qrious, html5-qrcode, tsparticles, Inter
tools/          scripts de build (íconos, vendor, import, css, smoke)
```

El renderer se sirve por el esquema privilegiado `app://ecsendpro/`, **no** por `file://`.
Sin esto `localStorage` e IndexedDB quedan en un origen opaco y los ajustes y el historial
no sobreviven al reinicio de la aplicación.

Ventana: `contextIsolation` activo, `nodeIntegration` desactivado, `sandbox` activo.

## Recursos sin CDN

Todo se sirve local desde `src/renderer/vendor/`, así que la app abre y funciona
sin internet. Lo único que sigue saliendo a la red es el **descubrimiento en
red**: Trystero se carga por `import()` desde `cdn.jsdelivr.net` y se conecta a
relays nostr remotos. No tiene bundle standalone, y aunque lo tuviera los relays
son servidores ajenos: el descubrimiento requiere internet por diseño
(ARCHITECTURE.md §12 del sitio). El CSP permite ese origen y nada más.

| Recurso | Origen | Peso |
|---|---|---|
| lucide | unpkg 0.462.0 | 348 KB |
| html5-qrcode | unpkg 2.3.8 | 367 KB |
| peerjs | unpkg 1.5.2 | 92 KB |
| qrious | cdnjs 4.0.2 | 17 KB |
| tsparticles-slim | jsdelivr 2.0.6 | 146 KB |
| Inter (5 pesos, latin) | Google Fonts | 236 KB |

## Tailwind

Se usa **Tailwind v3.4 a propósito**, no v4. El sitio corre sobre Play CDN v3 y
tiene 59 usos de `border` sin color explícito más un `shadow-sm`. En v4 el color
de borde por defecto pasó a `currentColor` y `shadow-sm` pasó a `shadow-xs`, así
que migrar a v4 cambiaría el diseño en silencio.

La config del sitio vive ahora en `tailwind.config.js` con los mismos colores
(`dark`, `panel`, `primary`, `secondary`) y las mismas animaciones
(`radar-spin`, `ping-slow`, `slide-up`).

El `safelist` cubre las clases que en `app.js` solo existen interpoladas en
plantillas (`class="p-2 ${bg} rounded-lg"`), donde el escaner estático no las ve:
`colorClass`, `iconColorClass`, `bubbleClass`, `iconColor`, `bg` y `color`.

## Desarrollo

```bash
npm install
npm start
```

### Verificación

```bash
npm run verify                    # lint + smoke sobre el código fuente
npm run smoke                     # idem
npm run smoke -- dist\win-unpacked\ECSendPro.exe   # sobre la app empaquetada
```

El smoke test no se limita al preload: confirma que llegó el CSS compilado, que
la fuente Inter vendorizada cargó, que las 5 librerías quedaron expuestas en el
renderer, que `app.js` corrió, que no quedó ningún `<script src="http...">` y que
no hubo violaciones de CSP.

```bash
npm run vendor      # baja las librerías y las fuentes a src/renderer/vendor
npm run css         # compila Tailwind a src/renderer/styles.css
npm run icons       # arma los .ico desde icono/logo.jpg
npm run sync        # baja el sitio a .upstream/ y muestra el diff (no aplica nada)
npm run import:site # reimporta el sitio aplicando las diferencias de escritorio
```

> `sync` **no** aplica cambios: el fork se edita a mano. `import:site` aplica las
> sustituciones con anclas exactas y **aborta** si el sitio cambió algo, para no
> dejar el fork roto en silencio. Es el flujo para adoptar cambios del sitio.

## Empaquetado

```bash
npm run dist       # instalador NSIS en dist/
npm run dist:dir   # solo la carpeta win-unpacked (para probar sin instalar)
```

Salida: `dist/ECSendPro-Setup-<version>.exe` (~107 MB) más `.blockmap` y `latest.yml`,
necesarios para la auto-actualización.

> El instalador no está firmado con certificado. Windows SmartScreen va a mostrar
> "editor desconocido" la primera vez. Para eliminarlo hace falta un code-signing
> certificate.

## Notas

- Desinstalar **no** borra los ajustes: quedan en `%APPDATA%\ECSend Pro`.
- La carpeta de descargas por defecto será `%USERPROFILE%\Documentos\ECSendPRO` (Fase 4).