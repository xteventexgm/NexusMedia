const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { enrichItems, enrichDetails } = require('./src/utils/tmdb');

const app = express();
app.use(cors());
app.use(express.json());

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
const HOME_TTL = 5 * 60 * 1000; // 5 minutos

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
        const data = await req.provider.getEnlaces(req.query.url);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
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

app.listen(process.env.NEXUS_API_PORT || 3000, '127.0.0.1', () =>
  console.log(`🔥 Servidor corriendo en http://127.0.0.1:${process.env.NEXUS_API_PORT || 3000}`)
)

process.on('disconnect', () => {
    console.log('⚠️ Proceso principal desconectado. Cerrando servidor Express de forma segura...');
    process.exit(0);
});