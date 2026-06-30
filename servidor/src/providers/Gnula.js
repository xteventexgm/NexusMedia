const ProviderBase = require("./ProviderBase");
const axios = require("axios");
const cheerio = require("cheerio");
const config = require("../config/env");
const { resolveEmbedToStream, sortServersHlsFirst } = require("../utils/hlsResolver");

class Gnula extends ProviderBase {
    constructor() {
        super();
        this.id = "gnula";
        this.nombre = "Gnula HD";
        this.icono = "🍿";
        this.color = "#8b5cf6"; // Violeta
        this.baseUrl = "https://ww3.gnulahd.nu";
    }

    async getFiltros() {
        return [
            {
                id: "type",
                nombre: "Tipo",
                opciones: [
                    { valor: "Pelicula", etiqueta: "Películas" },
                    { valor: "Serie", etiqueta: "Series" },
                    { valor: "Anime", etiqueta: "Animes" }
                ],
            },
            {
                id: "order",
                nombre: "Orden",
                opciones: [
                    { valor: "latest", etiqueta: "Últimos" },
                    { valor: "popular", etiqueta: "Populares" }
                ]
            }
        ];
    }

    async getCatalogo(filtros = {}, page = 1) {
        const type = filtros.type || "Pelicula";
        const order = filtros.order || "latest";
        
        let typePath = "peliculas";
        if (type === "Serie") typePath = "series";
        if (type === "Anime") typePath = "anime";
        
        let urlFinal = `${this.baseUrl}/ver/${typePath}/`;
        
        const params = [];
        if (page > 1) params.push(`page=${page}`);
        if (order === "popular") params.push(`order=popular`);
        
        if (params.length > 0) {
            urlFinal += `?${params.join('&')}`;
        }

        try {
            const { data } = await axios.get(urlFinal, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 10000
            });
            const $ = cheerio.load(data);
            const resultados = [];

            $("div.postbody div.listupd article.bs").each((i, el) => {
                if ($(el).hasClass("styleegg")) return;
                
                const aTag = $(el).find("div.bsx > a");
                if (!aTag.length) return;
                
                let titulo = aTag.attr("title")?.trim();
                if (!titulo) titulo = $(el).find("div.tt h2").text().trim();
                
                const url = aTag.attr("href");
                if (url && url.includes("/blog/")) return;
                if (titulo.toLowerCase().includes("mejores") || titulo.toLowerCase().includes("cronología")) return;

                const imgTag = $(el).find("img.ts-post-image").first().length ? $(el).find("img.ts-post-image").first() 
                             : $(el).find("img.wp-post-image").first().length ? $(el).find("img.wp-post-image").first() 
                             : $(el).find("div.limit img").first();
                             
                let poster = imgTag.attr("src") || imgTag.attr("data-src") || imgTag.attr("data-lazy-src");
                if (poster) poster = poster.split("?")[0];
                
                if (titulo && url) {
                    resultados.push({ titulo, url, poster });
                }
            });

            return resultados;
        } catch (error) {
            console.error("[GnulaHD] Error obteniendo catálogo:", error.message);
            return [];
        }
    }

    async buscar(query, page = 1) {
        let urlFinal = `${this.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;
        if (page === 1) urlFinal = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
        
        try {
            const { data } = await axios.get(urlFinal, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000
            });
            const $ = cheerio.load(data);
            const resultados = [];

            $("div.listupd article.bs").each((i, el) => {
                if ($(el).hasClass("styleegg")) return;
                
                const aTag = $(el).find("div.bsx > a");
                if (!aTag.length) return;
                
                let titulo = aTag.attr("title")?.trim();
                if (!titulo) titulo = $(el).find("div.tt h2").text().trim();
                
                const url = aTag.attr("href");
                if (url && url.includes("/blog/")) return;
                
                const imgTag = $(el).find("img.ts-post-image").first().length ? $(el).find("img.ts-post-image").first() 
                             : $(el).find("img.wp-post-image").first().length ? $(el).find("img.wp-post-image").first() 
                             : $(el).find("div.limit img").first();
                             
                let poster = imgTag.attr("src") || imgTag.attr("data-src") || imgTag.attr("data-lazy-src");
                if (poster) poster = poster.split("?")[0];
                
                if (titulo && url) {
                    resultados.push({ titulo, url, poster });
                }
            });
            return resultados;
        } catch (error) {
            console.error("[GnulaHD] Error buscando:", error.message);
            return [];
        }
    }

    async getDetalles(urlPath) {
        const targetUrl = urlPath.startsWith("http") ? urlPath : `${this.baseUrl}${urlPath}`;
        try {
            const { data } = await axios.get(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000
            });
            const $ = cheerio.load(data);

            const titulo = $("h1.gnpv-title").text().trim();
            if (!titulo) return null;

            let poster = $("div.gnpv-poster img").attr("src");
            if (poster) poster = poster.split("?")[0];

            let sinopsis = $("div.gnpv-syn-text").text().trim() || $("meta[property='og:description']").attr("content");
            
            const badge = $("div.gnpv-badge").text() || "";
            const yearMatch = badge.match(/\d{4}/);
            const año = yearMatch ? yearMatch[0] : null;

            const tags = [];
            $("div.gnpv-genres a").each((i, el) => tags.push($(el).text().trim()));
            
            const scoreText = $("span.gnpv-rating").text().replace("★", "").trim();

            const isanime = tags.some(t => t.toLowerCase().includes("anime"));
            const isseries = badge.toLowerCase().includes("serie") || isanime || $("div.eplister").length > 0;

            const detalles = {
                titulo,
                sinopsis,
                poster,
                año,
                calificacion: scoreText ? `${scoreText}/10` : null,
                generos: tags,
                estado: "Completado",
                episodios: []
            };

            if (isseries) {
                $("div.eplister ul li").each((i, el) => {
                    const aTag = $(el).find("a");
                    if (!aTag.length) return;
                    
                    const href = aTag.attr("href");
                    const epnumtext = aTag.find("div.epl-num").text().trim();
                    const eptitle = aTag.find("div.epl-title").text().trim();
                    
                    detalles.episodios.push({
                        nombre: eptitle || epnumtext,
                        url: href
                    });
                });
                detalles.episodios.reverse(); 
            } else {
                detalles.episodios.push({
                    nombre: "Película Completa",
                    episodio: 1,
                    url: targetUrl
                });
            }

            return detalles;
        } catch (error) {
            console.error("[GnulaHD] Error en detalles:", error.message);
            throw error;
        }
    }

    async getEnlaces(urlEpisodio) {
        const targetUrl = urlEpisodio.startsWith("http") ? urlEpisodio : `${this.baseUrl}${urlEpisodio}`;
        try {
            const { data } = await axios.get(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: config.httpTimeoutMs
            });

            const regex = /var\s+(_gnpv_ep_langs|_gd)\s*=\s*(\[.*?\]);/s;
            const match = data.match(regex);

            const crudos = [];
            if (match && match[2]) {
                try {
                    const langs = JSON.parse(match[2]);
                    langs.forEach((langObj) => {
                        const label = langObj.label || 'Latino';
                        if (langObj.servers && Array.isArray(langObj.servers)) {
                            langObj.servers.forEach((srv) => {
                                let src = srv.src;
                                if (!src) return;
                                src = src.replace(/\\\//g, '/');
                                if (src.startsWith('//')) src = `https:${src}`;
                                crudos.push({
                                    nombre: `${srv.title || 'Servidor'} [${label}]`,
                                    url: src
                                });
                            });
                        }
                    });
                } catch (e) {
                    console.error("[GnulaHD] Error parseando JSON de servidores:", e.message);
                }
            }

            if (!crudos.length) return [];

            const servidores = await Promise.all(
                crudos.map(async (entry) => {
                    const hls = await resolveEmbedToStream(entry.url, {
                        label: `Auto-Play HLS [${entry.nombre}]`,
                        referer: entry.url
                    });
                    if (hls) return hls;
                    return entry;
                })
            );

            return sortServersHlsFirst(servidores.filter((s) => s && s.url));
        } catch (error) {
            console.error("[GnulaHD] Error obteniendo videos:", error.message);
            return [];
        }
    }
}

module.exports = Gnula;
