const ProviderBase = require('./ProviderBase');
const { gqlRequest } = require('../utils/doramasApi');
const { resolveEmbedToStream, sortServersHlsFirst } = require('../utils/hlsResolver');

class DoramasFlix extends ProviderBase {
    constructor() {
        super();
        this.id = 'doramasflix';
        this.nombre = 'DoramasFlix';
        this.icono = '🎭';
        this.color = '#ec4899';
    }

    getImageUrl(path) {
        if (!path) return '';
        return path.startsWith('/') ? `https://image.tmdb.org/t/p/w1280${path}` : path;
    }

    getLangById(id) {
        const langs = {
            "13109": "Coreano", "13110": "Japonés", "13111": "Mandarín",
            "13112": "Tailandés", "37": "Castellano", "38": "Latino", "192": "Subtitulado"
        };
        return langs[id] || id;
    }

    generoAId(slug) {
        const mapa = {
            'accion': '5f0630baeb20933e4aeb6869',
            'aventura': '5f0630b3eb20933e4aeb6771',
            'animacion': '5f0630b5eb20933e4aeb67ac',
            'ciencia-ficcion': '5f0630b5eb20933e4aeb67a8',
            'comedia': '5f0630b0eb20933e4aeb66f4',
            'crimen': '5f0630b0eb20933e4aeb6700',
            'documental': '5f0630b0eb20933e4aeb66eb',
            'drama': '5f0630afeb20933e4aeb66e0',
            'familia': '5f0630b2eb20933e4aeb6745',
            'fantasia': '5f0630b3eb20933e4aeb6772',
            'misterio': '5f0630b0eb20933e4aeb6701',
            'romance': '5f0630b3eb20933e4aeb6773',
            'terror': '5f0630baeb20933e4aeb685b',
            'thriller': '5f2c4d11ca7ff72d546e4ac7',
            'western': '5f0630b5eb20933e4aeb67a7',
            'reality': '5f0630b2eb20933e4aeb6731',
            'politica': '5f0630b0eb20933e4aeb66fb'
        };
        return mapa[slug] || null;
    }

    mapItem(item) {
        const esSerie = item.__typename === 'Dorama' || item.isTVShow === true;
        return {
            titulo: item.name,
            url: `${esSerie ? 'serie' : 'pelicula'}|${item.slug}|${item._id}`,
            poster: this.getImageUrl(item.poster || item.poster_path),
            estado: esSerie ? "Dorama" : "Película"
        };
    }

    aplicarMetadatos(detalles, info, fallbackEstado) {
        if (!info) return;
        detalles.titulo = info.name || detalles.titulo;
        detalles.sinopsis = info.overview || detalles.sinopsis;
        detalles.poster = this.getImageUrl(info.poster || info.poster_path) || detalles.poster;
        if (info.genres) detalles.generos = info.genres.map(g => g.name);
        if (info.labels && info.labels.length > 0) {
            const labelEstado = info.labels.find(l => /emisi|finaliz|pr[oó]x|estren/i.test(l.name));
            if (labelEstado) detalles.estado = labelEstado.name;
        }
        if (!detalles.estado) detalles.estado = fallbackEstado;
    }

    tituloDesdeSlug(slug) {
        if (!slug) return '';
        return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    async buscarMetadatosFallback(slug, id) {
        try {
            const data = await gqlRequest({
                operationName: 'searchAll',
                variables: { input: this.tituloDesdeSlug(slug) },
                query: 'query searchAll($input: String!) { searchDorama(input: $input, limit: 20) { _id slug name poster_path isTVShow poster overview genres { name } labels { name } __typename } searchMovie(input: $input, limit: 20) { _id name slug poster_path poster overview genres { name } labels { name } __typename } }'
            }, 'searchAllFallback');

            const items = [
                ...(data.data?.searchDorama || []),
                ...(data.data?.searchMovie || [])
            ];
            return items.find((it) => it.slug === slug || it._id === id) || items[0] || null;
        } catch (e) {
            console.warn('[DoramasFlix] Fallback metadatos falló:', e.message);
            return null;
        }
    }

    async getFiltros() {
        return [
            {
                id: "categoria",
                nombre: "Tipo",
                opciones: [
                    { valor: "", etiqueta: "Doramas / Series" },
                    { valor: "peliculas", etiqueta: "Películas" }
                ]
            },
            {
                id: "genero",
                nombre: "Género",
                opciones: [
                    { valor: "", etiqueta: "Todos" },
                    { valor: "accion", etiqueta: "Acción" },
                    { valor: "animacion", etiqueta: "Animación" },
                    { valor: "aventura", etiqueta: "Aventura" },
                    { valor: "ciencia-ficcion", etiqueta: "Ciencia Ficción" },
                    { valor: "comedia", etiqueta: "Comedia" },
                    { valor: "crimen", etiqueta: "Crimen" },
                    { valor: "documental", etiqueta: "Documental" },
                    { valor: "drama", etiqueta: "Drama" },
                    { valor: "familia", etiqueta: "Familia" },
                    { valor: "fantasia", etiqueta: "Fantasía" },
                    { valor: "misterio", etiqueta: "Misterio" },
                    { valor: "romance", etiqueta: "Romance" },
                    { valor: "terror", etiqueta: "Terror" },
                    { valor: "thriller", etiqueta: "Thriller" },
                    { valor: "western", etiqueta: "Western" }
                ]
            }
        ];
    }

    async getCatalogo(filtros = {}, page = 1) {
        const isPeliculas = filtros.categoria === 'peliculas';
        const genreId = filtros.genero ? this.generoAId(filtros.genero) : null;
        const limit = 32;
        const skip = (page - 1) * limit;

        let body;
        if (isPeliculas) {
            const filter = {};
            if (genreId) filter.genreId = genreId;
            body = {
                operationName: "paginationMovie",
                variables: { perPage: limit, sort: "CREATEDAT_DESC", filter, page: page },
                query: "query paginationMovie($page: Int, $perPage: Int, $sort: SortFindManyMovieInput, $filter: FilterFindManyMovieInput) {\n  paginationMovie(page: $page, perPage: $perPage, sort: $sort, filter: $filter) {\n    items {\n      _id\n      name\n      slug\n      poster_path\n      poster\n      isTVShow\n      __typename\n    }\n  }\n}"
            };
        } else {
            const filter = { isTVShow: false };
            if (genreId) filter.genreId = genreId;
            body = {
                operationName: "listDoramasMobile",
                variables: { filter, limit: limit, skip: skip, sort: "_ID_DESC" },
                query: "query listDoramasMobile($limit: Int, $skip: Int, $sort: SortFindManyDoramaInput, $filter: FilterFindManyDoramaInput) {\n  listDoramas(limit: $limit, skip: $skip, sort: $sort, filter: $filter) {\n    _id\n    name\n    slug\n    poster_path\n    isTVShow\n    poster\n    __typename\n  }\n}"
            };
        }

        try {
            const data = await gqlRequest(body, body.operationName);
            if (!data || !data.data) return [];

            const items = isPeliculas ?
                (data.data.paginationMovie ? data.data.paginationMovie.items : []) :
                (data.data.listDoramas || []);

            return items.map(item => this.mapItem(item));
        } catch (error) {
            console.error('[DoramasFlix] getCatalogo:', error.message);
            return [];
        }
    }

    async getPopulares(page = 1) {
        const limit = 32;
        const skip = (page - 1) * limit;
        const body = {
            operationName: "listDoramasMobile",
            variables: { filter: { isTVShow: false }, limit, skip, sort: "POPULARITY_DESC" },
            query: "query listDoramasMobile($limit: Int, $skip: Int, $sort: SortFindManyDoramaInput, $filter: FilterFindManyDoramaInput) {\n  listDoramas(limit: $limit, skip: $skip, sort: $sort, filter: $filter) {\n    _id\n    name\n    slug\n    poster_path\n    isTVShow\n    poster\n    __typename\n  }\n}"
        };
        try {
            const data = await gqlRequest(body, 'listDoramasPopular');
            if (!data?.data?.listDoramas) return [];
            return data.data.listDoramas.map(item => this.mapItem(item));
        } catch (e) {
            console.error('[DoramasFlix] getPopulares:', e.message);
            return [];
        }
    }

    async buscar(query, page = 1) {
        void page;
        const body = {
            operationName: "searchAll",
            variables: { input: query },
            query: "query searchAll($input: String!) { searchDorama(input: $input, limit: 10) { _id slug name poster_path isTVShow poster __typename } searchMovie(input: $input, limit: 10) { _id name slug poster_path poster __typename } }"
        };

        try {
            const data = await gqlRequest(body, 'searchAll');
            const series = data.data?.searchDorama || [];
            const peliculas = data.data?.searchMovie || [];
            return [...series, ...peliculas].map(item => this.mapItem(item));
        } catch (e) {
            console.error('[DoramasFlix] buscar:', e.message);
            return [];
        }
    }

    async getDetalles(urlPath) {
        let decoded = urlPath;
        try {
            decoded = decodeURIComponent(urlPath);
        } catch (_) {
            decoded = urlPath;
        }

        const [tipo, slug, id] = decoded.split('|');
        const detalles = {
            titulo: this.tituloDesdeSlug(slug),
            sinopsis: '',
            poster: '',
            año: null,
            calificacion: null,
            generos: [],
            episodios: [],
            estado: null
        };

        try {
            if (tipo === 'pelicula') {
                const data = await gqlRequest({
                    operationName: "detailMovieExtra",
                    variables: { slug: slug },
                    query: "query detailMovieExtra($slug: String!) { detailMovie(filter: {slug: $slug}) { name overview poster_path poster links_online genres { name } labels { name } } }"
                }, 'detailMovieExtra');

                const info = data.data?.detailMovie;
                if (!info) throw new Error('Película no encontrada');

                this.aplicarMetadatos(detalles, info, 'Película');
                detalles.episodios.push({
                    nombre: "Película",
                    episodio: 1,
                    url: `links|${JSON.stringify(info.links_online || [])}`
                });
            } else {
                let info = null;
                try {
                    const data = await gqlRequest({
                        operationName: "detailDorama",
                        variables: { slug: slug },
                        query: "query detailDorama($slug: String!) { detailDorama(filter: {slug: $slug}) { name overview poster_path poster genres { name } labels { name } } }"
                    }, 'detailDorama');
                    info = data.data?.detailDorama;
                } catch (e) {
                    console.warn('[DoramasFlix] detailDorama falló, intentando fallback:', e.message);
                    const fallback = await this.buscarMetadatosFallback(slug, id);
                    if (fallback) info = fallback;
                }

                this.aplicarMetadatos(detalles, info, 'Dorama');

                let seasons = [];
                try {
                    const data = await gqlRequest({
                        operationName: "listSeasons",
                        variables: { serie_id: id },
                        query: "query listSeasons($serie_id: MongoID!) { listSeasons(sort: NUMBER_ASC, filter: {serie_id: $serie_id}) { season_number } }"
                    }, 'listSeasons');
                    seasons = data.data?.listSeasons || [];
                } catch (e) {
                    console.warn('[DoramasFlix] listSeasons:', e.message);
                }

                if (seasons.length > 0) {
                    const promesasEpisodios = seasons.map(async (season) => {
                        try {
                            const data = await gqlRequest({
                                operationName: "listEpisodesPagination",
                                variables: { serie_id: id, season_number: season.season_number, page: 1 },
                                query: "query listEpisodesPagination($page: Int!, $serie_id: MongoID!, $season_number: Float!) { paginationEpisode( page: $page perPage: 1000 sort: NUMBER_ASC filter: {type_serie: \"dorama\", serie_id: $serie_id, season_number: $season_number} ) { items { name episode_number season_number slug } } }"
                            }, 'listEpisodesPagination');
                            return data.data?.paginationEpisode?.items || [];
                        } catch (e) {
                            console.warn('[DoramasFlix] listEpisodesPagination:', e.message);
                            return [];
                        }
                    });

                    const resultadosEps = await Promise.all(promesasEpisodios);
                    resultadosEps.flat().forEach(ep => {
                        if (!ep) return;
                        detalles.episodios.push({
                            nombre: ep.name,
                            episodio: ep.episode_number,
                            temporada: ep.season_number,
                            url: `episodio|${ep.slug}`
                        });
                    });
                }
            }
        } catch (error) {
            console.error('[DoramasFlix] getDetalles:', error.message);
        }
        return detalles;
    }

    fixHostsLinks(url) {
        return url.replace("https://hglink.to", "https://streamwish.to")
                  .replace("https://swdyu.com", "https://streamwish.to")
                  .replace("https://cybervynx.com", "https://streamwish.to")
                  .replace("https://mivalyo.com", "https://vidhidepro.com")
                  .replace("https://dinisglows.com", "https://vidhidepro.com")
                  .replace("https://dhtpre.com", "https://vidhidepro.com")
                  .replace("https://uqload.to", "https://uqload.co");
    }

    async extraerVideoPuro(embedUrl, referer) {
        const hls = await resolveEmbedToStream(embedUrl, { referer: referer || embedUrl });
        return hls ? hls.url : null;
    }

    async getEnlaces(urlEpisodio) {
        let enlacesCrudos = [];

        if (urlEpisodio.startsWith('links|')) {
            const jsonStr = urlEpisodio.replace('links|', '');
            enlacesCrudos = JSON.parse(jsonStr);
        }
        else if (urlEpisodio.startsWith('episodio|')) {
            let slug = urlEpisodio.replace('episodio|', '');

            slug = slug
                .replace(/^https?:\/\/(www\.)?doramasflix\.(in|co)\/?/i, '')
                .replace(/^\//, '');

            try {
                const data = await gqlRequest({
                    operationName: "GetEpisodeLinks",
                    variables: { episode_slug: slug },
                    query: "query GetEpisodeLinks($episode_slug: String!) { detailEpisode(filter: {slug: $episode_slug, type_serie: \"dorama\"}) { links_online } }"
                }, 'GetEpisodeLinks');
                enlacesCrudos = data.data?.detailEpisode?.links_online || [];
            } catch (e) {
                console.error('[DoramasFlix] getEnlaces:', e.message);
            }
        }

        const servidores = [];
        for (const item of enlacesCrudos) {
            if (!item.link) continue;
            const urlCorregida = this.fixHostsLinks(item.link);
            const idioma = this.getLangById(item.lang || item.server);

            if (/vidhide|streamwish|filemoon|streamtape|strtape|stape|minochinos|uqload|dood|voe/i.test(urlCorregida)) {
                const hls = await resolveEmbedToStream(urlCorregida, {
                    label: `Auto-Play HLS [${idioma}]`,
                    referer: urlCorregida
                });
                if (hls) {
                    servidores.push(hls);
                } else {
                    servidores.push({
                        nombre: `Iframe (${new URL(urlCorregida).hostname.split('.')[0]}) [${idioma}]`,
                        url: urlCorregida
                    });
                }
            } else {
                servidores.push({
                    nombre: `Servidor: ${item.server || 'Externo'} [${idioma}]`,
                    url: urlCorregida
                });
            }
        }
        return sortServersHlsFirst(servidores);
    }
}

module.exports = DoramasFlix;
