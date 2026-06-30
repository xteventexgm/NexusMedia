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

## Build e IPK (LG WebOS)

```bash
npm run build:ipk
```

1. Añade **`public/icon.png`** (130×130 px) — obligatorio para empaquetar.
2. La salida queda en **`dist/`** con `appinfo.json`, `index.html` y assets.
3. Con [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-dev-guide) instalado:

```bash
cd dist
ares-package .
ares-install --device TU_TV com.nexusmedia.webos_1.0.0_all.ipk
```

**Checklist IPK**

| Requisito | Estado |
|-----------|--------|
| `appinfo.json` | ✓ |
| `base: './'` en Vite | ✓ |
| Polyfills Chrome 38 (legacy) | ✓ |
| hls.js para streams | ✓ |
| `public/icon.png` 130×130 | ⚠ Falta — añadir antes de empaquetar |
| `VITE_API_URL` con `/api` | ✓ (se normaliza solo) |

Configura la URL del API en `.env` o en **Ajustes ⚙** en la TV.
