const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./src/config/env');
const { enrichItems, enrichDetails } = require('./src/utils/tmdb');
const {
  isStreamUrl,
  wrapStreamUrl,
  rewriteM3u8Playlist,
  proxyStreamRequest,
  resolvePublicApiBase
} = require('./src/utils/streamProxy');
const { sortServersHlsFirst, isPlayableStreamUrl } = require('./src/utils/hlsResolver');

process.on('uncaughtException', (err) => {
    console.error('[ERROR] uncaughtException:', err?.stack || err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[ERROR] unhandledRejection:', reason?.stack || reason);
});

try {
    fs.mkdirSync(config.dataDir, { recursive: true });
} catch (err) {
    console.warn('[WARN] No se pudo crear directorio de datos:', err.message);
}

const corsOrigin =
    config.corsOrigin === '*'
        ? '*'
        : config.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);

const corsOptions = {
    origin: corsOrigin,
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    credentials: corsOrigin !== '*',
    maxAge: 86400
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime()
    });
});

// ==========================================
// CARGA AUTOMÁTICA DE EXTENSIONES
// Para añadir una extensión nueva en el futuro, basta con crear un archivo
// en src/providers/ que extienda ProviderBase. Se registra solo, sin tocar este archivo.
// ==========================================
const providers = {};
const providersDir = path.join(__dirname, 'src', 'providers');

fs.readdirSync(providersDir)
    .filter((file) => file.endsWith('.js') && file !== 'ProviderBase.js')
    .forEach((file) => {
        try {
            const ProviderClass = require(path.join(providersDir, file));
            const instancia = new ProviderClass();
            if (instancia.id && instancia.id !== 'base') {
                providers[instancia.id] = instancia;
                console.log(`✅ Extensión cargada: ${instancia.nombre} (${instancia.id})`);
            } else {
                console.warn(`⚠️ Ignorado ${file}: no define un 'id' válido.`);
            }
        } catch (error) {
            console.error(`❌ Error cargando la extensión ${file}:`, error.message);
        }
    });

console.log(`🧩 Total de extensiones activas: ${Object.keys(providers).length}`);

app.get('/api/providers', (req, res) => {
    res.json(
        Object.values(providers).map((p) => ({
            id: p.id,
            nombre: p.nombre,
            icono: p.icono || '📺',
            color: p.color || '#e50914'
        }))
    );
}); 

const checkProvider = (req, res, next) => {
    if (!providers[req.params.id]) return res.status(404).json({ error: "Extensión no encontrada" });
    req.provider = providers[req.params.id];
    next();
};

// Proveedores de "contenido bajo demanda" (catálogo de pósters). La TV en vivo
// se excluye de estas agregaciones porque tiene su propia vista IPTV dedicada.
const proveedoresContenido = () => Object.values(providers).filter((p) => p.id !== 'tv');

// ==========================================
// API DEDICADA DE TV EN VIVO (estilo IPTV Smarters)
// ==========================================
app.get('/api/tv/data', async (req, res) => {
    try {
        const tv = providers['tv'];
        if (!tv || !tv.getDatosTv) return res.status(404).json({ error: 'Extensión de TV no disponible' });
        res.json(await tv.getDatosTv());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Catálogo UNIFICADO: mezcla el contenido de todos los providers en una sola lista
app.get('/api/catalog', async (req, res) => {
    try {
        const page = req.query.page || 1;

        const listas = await Promise.all(
            proveedoresContenido().map(async (provider) => {
                try {
                    const items = await provider.getCatalogo({}, page);
                    // Etiquetamos cada item con su provider para que el frontend sepa de quién es
                    return (items || []).map((it) => ({ ...it, provider: provider.id }));
                } catch (error) {
                    console.error(`[Catálogo Unificado] Error en ${provider.nombre}:`, error.message);
                    return [];
                }
            })
        );

        // Intercalado round-robin para que no salga "todo el anime junto y luego todas las pelis"
        const mezclado = [];
        const maxLen = listas.reduce((m, l) => Math.max(m, l.length), 0);
        for (let i = 0; i < maxLen; i++) {
            for (const lista of listas) {
                if (lista[i]) mezclado.push(lista[i]);
            }
        }

        const resultadoEnriquecido = await enrichItems(mezclado);
        res.json(resultadoEnriquecido);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Quita acentos y normaliza para comparar etiquetas/valores de géneros entre extensiones
const normalizar = (s) =>
    (s || '')
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

const obtenerFiltros = async (p) => {
    try {
        return p.getFiltros ? await p.getFiltros() : [];
    } catch (e) {
        return [];
    }
};

// Intercala varias listas (round-robin)
const intercalar = (listas) => {
    const out = [];
    const maxLen = listas.reduce((m, l) => Math.max(m, l.length), 0);
    for (let i = 0; i < maxLen; i++) {
        for (const lista of listas) if (lista[i]) out.push(lista[i]);
    }
    return out;
};

// Devuelve los items de un género combinando todas las extensiones que lo soporten.
// El emparejamiento se hace por el nombre del género contra los filtros que declara
// cada extensión, así una extensión nueva se suma sola.
const itemsPorGenero = async (genLabel, page = 1) => {
    const objetivo = normalizar(genLabel);
    const provs = proveedoresContenido();
    const filtrosPorProv = await Promise.all(
        provs.map(async (p) => ({ p, filtros: await obtenerFiltros(p) }))
    );

    const consultas = [];
    for (const { p, filtros } of filtrosPorProv) {
        for (const filtro of filtros) {
            const esGenero =
                /gener|genre/i.test(filtro.id) || /gener|genre/i.test(filtro.nombre || '');
            if (!esGenero) continue;
            const opcion = (filtro.opciones || []).find(
                (o) => normalizar(o.etiqueta) === objetivo || normalizar(o.valor) === objetivo
            );
            if (opcion && opcion.valor) {
                consultas.push(
                    (async () => {
                        try {
                            return ((await p.getCatalogo({ [filtro.id]: opcion.valor }, page)) || []).map(
                                (it) => ({ ...it, provider: p.id })
                            );
                        } catch (e) {
                            return [];
                        }
                    })()
                );
                break;
            }
        }
    }
    return intercalar(await Promise.all(consultas));
};

// Fila "Popular": combina las extensiones que exponen un orden de popularidad real.
const itemsPopulares = async (page = 1) => {
    const listas = await Promise.all(
        proveedoresContenido().map(async (p) => {
            try {
                const items = await p.getPopulares(page);
                if (!items) return null; // la extensión no soporta populares
                return items.map((it) => ({ ...it, provider: p.id }));
            } catch (e) {
                return null;
            }
        })
    );
    return intercalar(listas.filter(Boolean));
};

// Caché en memoria del home (las filas no cambian a cada segundo).
let homeCache = { data: null, ts: 0 };
const HOME_TTL = config.homeCacheTtlMs;

// HOME estilo Netflix: devuelve filas (carruseles) por extensión y por género.
// Las filas de género se construyen automáticamente a partir de los filtros que
// declara cada extensión, así una extensión nueva se suma sola.
app.get('/api/home', async (req, res) => {
    try {
        if (homeCache.data && Date.now() - homeCache.ts < HOME_TTL) {
            return res.json(homeCache.data);
        }

        const provs = proveedoresContenido();
        const generosDestacados = ['Acción', 'Comedia', 'Romance', 'Terror', 'Ciencia Ficción', 'Drama'];

        // Lanzamos TODO en paralelo (el tiempo total ≈ la petición más lenta, no la suma)
        const [populares, filasProveedor, filasGenero] = await Promise.all([
            // Fila destacada de populares (extensiones que lo soporten)
            itemsPopulares(1),
            // Una fila de novedades por cada extensión
            Promise.all(
                provs.map(async (p) => {
                    try {
                        const items = ((await p.getCatalogo({}, 1)) || []).map((it) => ({
                            ...it,
                            provider: p.id
                        }));
                        return {
                            id: `prov-${p.id}`,
                            titulo: `Novedades en ${p.nombre}`,
                            icono: p.icono,
                            color: p.color,
                            tipo: 'provider',
                            ref: p.id,
                            nombre: p.nombre,
                            items
                        };
                    } catch (e) {
                        return null;
                    }
                })
            ),
            // Filas por género (mezclando extensiones que soporten ese género)
            Promise.all(
                generosDestacados.map(async (genLabel) => ({
                    id: `gen-${normalizar(genLabel)}`,
                    titulo: genLabel,
                    tipo: 'genero',
                    ref: genLabel,
                    items: await itemsPorGenero(genLabel, 1)
                }))
            )
        ]);

        const filaPopular =
            populares.length > 0
                ? [{ id: 'popular', titulo: '🔥 Popular ahora', tipo: 'popular', items: populares }]
                : [];

        const filas = [...filaPopular, ...filasProveedor, ...filasGenero].filter(
            (f) => f && f.items && f.items.length > 0
        );

        // Enriquecer cada fila con TMDB antes de cachear
        for (let fila of filas) {
            fila.items = await enrichItems(fila.items);
        }

        homeCache = { data: filas, ts: Date.now() };
        res.json(filas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Vista de categoría (género) paginada y mezclada entre extensiones. La usa el botón "Ver más".
app.get('/api/category', async (req, res) => {
    try {
        const genero = req.query.genero;
        if (!genero) return res.status(400).json({ error: "Falta el parámetro 'genero'" });
        const page = parseInt(req.query.page, 10) || 1;
        const items = await itemsPorGenero(genero, page);
        const enriquecidos = await enrichItems(items);
        res.json(enriquecidos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/providers/:id/catalog', checkProvider, async (req, res) => {
    try {
        const page = req.query.page || 1;
        const filtros = { ...req.query };
        delete filtros.page; 
        const data = await req.provider.getCatalogo(filtros, page);
        const enriquecidos = await enrichItems(data);
        res.json(enriquecidos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/providers/:id/search', checkProvider, async (req, res) => {
    try {
        const page = req.query.page || 1; // Extraemos la página
        if (!req.query.q) return res.status(400).json({ error: "Falta el parámetro 'q'" });
        
        const data = await req.provider.buscar(req.query.q, page);
        const enriquecidos = await enrichItems(data);
        res.json(enriquecidos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.status(400).json({ error: "Falta el parámetro de búsqueda." });

        // Ejecutamos la búsqueda en TODAS las extensiones al mismo tiempo (en paralelo)
        const promesas = proveedoresContenido().map(async (provider) => {
            try {
                // Buscamos solo la primera página de cada proveedor
                const resultados = await provider.buscar(query, 1); 
                return {
                    id: provider.id,
                    nombre: provider.nombre,
                    resultados: resultados
                };
            } catch (error) {
                console.error(`[Búsqueda Global] Error en ${provider.nombre}:`, error.message);
                return { id: provider.id, nombre: provider.nombre, resultados: [] };
            }
        });

        // Esperamos a que todas terminen
        const datosAgrupados = await Promise.all(promesas);
        
        // Enriquecer resultados de búsqueda global
        for (let grupo of datosAgrupados) {
            grupo.resultados = await enrichItems(grupo.resultados);
        }

        res.json(datosAgrupados);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/providers/:id/details', checkProvider, async (req, res) => {
    try {
        if (!req.query.url) return res.status(400).json({ error: "Falta el parámetro 'url'" });
        const data = await req.provider.getDetalles(req.query.url);
        const enriquecido = await enrichDetails(data, req.provider.id);
        res.json(enriquecido);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/providers/:id/watch', checkProvider, async (req, res) => {
    try {
        if (!req.query.url) return res.status(400).json({ error: "Falta el parámetro 'url'" });
        const episodeUrl = req.query.url;
        console.log('[/watch] inicio', {
            provider: req.params.id,
            episodeUrl: String(episodeUrl).slice(0, 120)
        });

        const raw = await req.provider.getEnlaces(episodeUrl);
        const apiBase = resolvePublicApiBase(req);

        const normalized = (raw || [])
            .map((s) => ({
                nombre: s.nombre || s.server || s.name || 'Servidor',
                url: s.url || s.link || '',
                referer: s.referer || s.url || '',
                hls: s.hls
            }))
            .filter((s) => s.url);

        const sorted = sortServersHlsFirst(normalized);
        const data = sorted.map((s) => {
            const originalUrl = s.url;
            const referer = s.referer || originalUrl;

            if (!isStreamUrl(originalUrl)) {
                console.log('[/watch] iframe', {
                    provider: req.params.id,
                    nombre: s.nombre,
                    url: originalUrl.slice(0, 100)
                });
                return { nombre: s.nombre, url: originalUrl };
            }

            if (!isPlayableStreamUrl(originalUrl)) {
                console.warn('[/watch] marcado HLS pero no es stream reproducible', {
                    nombre: s.nombre,
                    url: originalUrl.slice(0, 100)
                });
                return { nombre: s.nombre, url: originalUrl };
            }

            const finalUrl = wrapStreamUrl(originalUrl, apiBase, referer);
            console.log('[/watch] HLS', {
                provider: req.params.id,
                nombre: s.nombre,
                urlOriginal: originalUrl.slice(0, 100),
                urlFinal: finalUrl.slice(0, 120),
                referer: referer.slice(0, 80),
                apiBase
            });
            return { nombre: s.nombre, url: finalUrl };
        });

        if (!data.length) {
            console.warn('[/watch] sin servidores', {
                provider: req.params.id,
                episodeUrl: String(episodeUrl).slice(0, 100)
            });
        } else {
            const hlsCount = data.filter((s) => /stream\/proxy|\.m3u8/i.test(s.url)).length;
            console.log('[/watch] listo', {
                provider: req.params.id,
                total: data.length,
                hls: hlsCount
            });
        }

        res.json(data);
    } catch (error) {
        console.error('[/watch] error', {
            provider: req.params.id,
            status: error.response?.status,
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: error.message });
    }
});

app.options('/api/stream/proxy', cors(corsOptions));
app.get('/api/stream/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    const referer = req.query.referer || '';

    try {
        if (!targetUrl) return res.status(400).send('Missing url');

        console.log('[STREAM PROXY]', {
            url: targetUrl,
            referer
        });

        const { data, contentType, status } = await proxyStreamRequest(targetUrl, referer);
        const isM3u8 =
            /\.m3u8(\?|$)/i.test(targetUrl) ||
            /mpegurl|m3u8/i.test(contentType);

        console.log('[STREAM PROXY] ok', {
            url: targetUrl,
            referer,
            status,
            contentType,
            isM3u8,
            bytes: data?.byteLength || data?.length || 0
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Cache-Control', 'no-cache');

        if (isM3u8) {
            const apiBase = resolvePublicApiBase(req);
            const body = rewriteM3u8Playlist(
                Buffer.from(data).toString('utf8'),
                targetUrl,
                apiBase,
                referer
            );
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(body);
        }

        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        res.send(data);
    } catch (error) {
        console.error('[STREAM PROXY] error', {
            url: targetUrl,
            referer,
            status: error.response?.status,
            contentType: error.response?.headers?.['content-type'],
            headers: error.response?.headers,
            message: error.message
        });
        res.status(error.response?.status === 403 ? 403 : 502).send('Proxy error');
    }
});

app.get('/api/providers/:id/filters', checkProvider, async (req, res) => {
    try {
        // Si la extensión tiene el método, lo ejecuta, si no, devuelve vacío
        if (req.provider.getFiltros) {
            const filtros = await req.provider.getFiltros();
            res.json(filtros);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
    console.error('[API] Error no manejado:', err?.stack || err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

const localHost = config.host === '0.0.0.0' ? 'localhost' : config.host;
const mode = config.isProduction ? 'production' : 'development';

app.listen(config.port, config.host, () => {
    console.log('═══════════════════════════════════════════');
    console.log('  Servidor iniciado');
    console.log(`  Puerto:     ${config.port}`);
    console.log(`  Host:       ${config.host}`);
    console.log(`  Modo:       ${mode}`);
    console.log(`  Entorno:    ${config.nodeEnv}`);
    console.log(`  Health:     http://${localHost}:${config.port}/health`);
    console.log(`  API:        http://${localHost}:${config.port}/api`);
    console.log(`  Extensiones: ${Object.keys(providers).length}`);
    if (config.doramasFlixRelayUrl) {
        console.log(`  DoramasFlix relay: ${config.doramasFlixRelayUrl}`);
    } else if (process.env.RENDER && providers.doramasflix) {
        console.log('  ⚠ DoramasFlix: sin relay (IP Render suele estar bloqueada)');
    }
    if (config.embed69RelayUrl) {
        console.log(`  Embed69 relay:   ${config.embed69RelayUrl}`);
    } else if (process.env.RENDER && providers.pelisplushd) {
        console.log('  ⚠ PelisplusHD: sin EMBED69_RELAY_URL (embed69 bloquea IP Render)');
    }
    if (config.nexusPublicUrl) {
        console.log(`  HLS proxy base: ${config.nexusPublicUrl}`);
    } else if (config.isProduction || process.env.RENDER) {
        console.log('  ⚠ FALTA NEXUS_PUBLIC_URL — el proxy HLS no funcionará en WebOS/TV');
    }
    console.log('═══════════════════════════════════════════');
});

process.on('disconnect', () => {
    console.log('⚠️ Proceso principal desconectado. Cerrando servidor Express de forma segura...');
    process.exit(0);
});