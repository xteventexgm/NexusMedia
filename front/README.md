# NexusMedia

Aplicación de escritorio (Electron) para streaming personal: anime, películas, doramas y TV en vivo. Incluye extensiones de scraping en Node.js y biblioteca local (favoritos, historial, progreso).

## Requisitos

- Node.js 18+
- npm
- Windows (build configurado para Win; desarrollo funciona en cualquier SO con Node)

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Arranca Electron con Vite (hot reload en el renderer) y el servidor Express embebido en el puerto **3000** (solo localhost).

## Compilar instalador Windows

```bash
npm run build:win
```

Genera el instalador NSIS en `dist/` (asistente clásico: elegir carpeta, atajos, etc.).

## Estructura del proyecto

```
src/
├── main/           # Proceso Electron (ventana, IPC, arranque del backend)
├── preload/        # Puente seguro renderer ↔ main
├── renderer/       # Interfaz (HTML + JS modular)
│   └── src/
│       ├── renderer.js      # Catálogo, detalle, navegación
│       ├── modules/tv.js    # TV en vivo (IPTV)
│       ├── modules/player.js # Reproductor de video
│       └── shared/api.js    # Cliente HTTP + errores visibles
└── servidor/       # API Express + extensiones (scrapers)
    └── src/providers/   # AnimeAv1, PelisplusHD, DoramasFlix, TvEnVivo…
```

## Extensiones

Cada fuente es un archivo en `src/servidor/src/providers/` que extiende `ProviderBase`. Se cargan automáticamente al iniciar el servidor.

## Datos del usuario

Favoritos, historial y progreso se guardan en:

`%APPDATA%/nexusmedia/nexus_library.json` (Windows)

La caché de canales TV se guarda en `tv_cache.json` dentro de la misma carpeta de usuario (no en el instalador).

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo |
| `npm run build` | Compila a `out/` |
| `npm run build:win` | Instalador Windows |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Notas

- Uso personal; el backend hace scraping de sitios públicos.
- Si el puerto 3000 está ocupado por otra app, NexusMedia avisará al iniciar.
- Proyecto móvil experimental (Kotlin): carpeta `port-mobile/` si está presente en el repo.
