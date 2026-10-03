# ECSend Pro — Windows

Programa nativo de escritorio para **ECSend Pro**, la app P2P de transferencia de archivos de [Estalingrado Corp](https://estalingradocorp.github.io/ECsendpro/).

Los archivos viajan directo de un dispositivo a otro por **WebRTC DataChannel** (cifrado DTLS/SRTP). No pasa nada por servidores de la app.

- **Sitio web:** https://estalingradocorp.github.io/ECsendpro/
- **Empresa:** Estalingrado Corp
- **Licencia:** MIT

## Estado

Fase 1 (cSkeleton nativo) completa: ventana, instalador NSIS y empaquetado funcionando.
El renderer todavía muestra la pantalla de arranque; el port del sitio web viene en la Fase 2.

| Fase | Alcance | Estado |
|---|---|---|
| 1 | Repo, ventana oscura, protocolo `app://`, íconos, instalador NSIS | ✅ |
| 2 | Dependencias vendorizadas + Tailwind compilado + CSP | ⏳ |
| 3 | Port del núcleo P2P (código, QR, DataChannel, chat, descubrimiento) | ⏳ |
| 4 | Descargas, ajustes, cámara + integración nativa | ⏳ |
| 5 | Identidad Estalingrado Corp | ⏳ |
| 6 | Auto-actualización + CI de releases | ⏳ |
| 7 | Docs y herramienta de sincronización con el sitio | ⏳ |

## Arquitectura

```
src/main/       proceso principal (ventana, protocolo, descargas, ajustes, bandeja, updater)
src/preload/    puente contextBridge -> window.ECDesktop
src/renderer/   interfaz (fork de primera clase del sitio web)
tools/          scripts de build (íconos, Tailwind, vendor, sync)
```

El renderer se sirve por el esquema privilegiado `app://ecsendpro/`, **no** por `file://`.
Sin esto `localStorage` e IndexedDB quedan en un origen opaco y los ajustes y el historial
no sobreviven al reinicio de la aplicación.

Ventana: `contextIsolation` activo, `nodeIntegration` desactivado, `sandbox` activo.

## Desarrollo

```bash
npm install
npm start
```

### Verificación

```bash
npm run lint     # sintaxis de main y preload
npm run smoke    # abre la app, valida app:// + preload + localStorage y sale
```

`npm run smoke` imprime algo como:

```
SMOKE_OK {"url":"app://ecsendpro/index.html","origin":"app://ecsendpro","bridge":true,"localStorage":true} 89ms
```

### Recursos generados

```bash
npm run icons    # baja los PNG del sitio y arma build/icon.ico + installerIcon.ico
```

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