# NexusMedia — Frontend WebOS

SPA Vite independiente de Electron. Orientado a LG WebOS 3+.

## Desarrollo

```bash
cd frontWebOS
npm install
npm run dev
```

Abrir http://localhost:5173

El motor de contenido (`servidor/`) debe estar ejecutándose por separado:

```bash
cd ../servidor
node server.js
```

Configura la URL del API en `.env` (`VITE_API_URL`) o desde **Ajustes ⚙** en la barra superior (se guarda en `localStorage`, sin recompilar):

```js
localStorage.setItem('api_url', 'http://192.168.1.10:3000/api')
```

## Build

```bash
npm run build
```

Salida en `dist/` — lista para empaquetar con webOS CLI (fase posterior).

**Bundle inicial (Fase 2):** ~55 KB JS + ~121 KB polyfills (hls.js y player se cargan solo al reproducir).

## Empaquetado WebOS

`appinfo.json` está preparado. Añade `public/icon.png` (130×130) antes de empaquetar.
