const ProviderBase = require("./ProviderBase");
const axios = require("axios");
const cheerio = require("cheerio");

class AnimeAv1 extends ProviderBase {
  constructor() {
    super();
    this.id = "animeav1";
    this.nombre = "AnimeAv1";
    this.icono = "🌸";
    this.color = "#a855f7";
    this.baseUrl = "https://animeav1.com";
  }

  async getCatalogo(filtros = {}, page = 1) {
    const params = new URLSearchParams();

    // 1. PRIMERO procesamos los filtros
    for (const clave in filtros) {
      const valor = filtros[clave];
      if (Array.isArray(valor)) {
        valor.forEach((item) => params.append(clave, item));
      } else {
        params.append(clave, valor);
      }
    }

    // 2. AL FINAL agregamos la página (Regla estricta de SvelteKit)
    params.append("page", page);

    const urlFinal = `${this.baseUrl}/catalogo?${params.toString()}`;
    console.log(`[AnimeAv1] Consultando Catálogo: ${urlFinal}`);

    const { data } = await axios.get(urlFinal);
    const $ = cheerio.load(data);
    const resultados = [];

    $("article").each((i, el) => {
      const titulo = $(el).find("h3").text().trim();
      const url = $(el).find("a").attr("href");
      const poster = $(el).find("figure img").attr("src");
      if (titulo && url) resultados.push({ titulo, url, poster });
    });
    return resultados;
  }

  // Populares reales: la web soporta el orden ?order=popular
  async getPopulares(page = 1) {
    const urlFinal = `${this.baseUrl}/catalogo?order=popular&page=${page}`;
    const { data } = await axios.get(urlFinal);
    const $ = cheerio.load(data);
    const resultados = [];
    $("article").each((i, el) => {
      const titulo = $(el).find("h3").text().trim();
      const url = $(el).find("a").attr("href");
      const poster = $(el).find("figure img").attr("src");
      if (titulo && url) resultados.push({ titulo, url, poster });
    });
    return resultados;
  }

  async buscar(query, page = 1) {
    const { data } = await axios.get(
      `${this.baseUrl}/catalogo?search=${encodeURIComponent(query)}&page=${page}`
    )
    const $ = cheerio.load(data)
    const resultados = []

    $('article').each((i, el) => {
      const titulo = $(el).find('h3').text().trim() || $(el).find('.title').text().trim()
      const url = $(el).find('a').attr('href') || $(el).attr('href')
      const poster = $(el).find('figure img').attr('src') || $(el).find('img').attr('src')
      const estadoWeb = $(el).find('.status').text().trim() || 'En emisión'

      if (titulo && url) {
        resultados.push({ titulo, url, poster, estado: estadoWeb })
      }
    })
    return resultados
  }

  async getDetalles(urlPath) {
    const { data } = await axios.get(`${this.baseUrl}${urlPath}`);
    const $ = cheerio.load(data);

    const detalles = {
      titulo: $("article h1").first().text().trim(),
      sinopsis: $("div.entry.text-lead p").first().text().trim(),
      poster: $("img.aspect-poster").attr("src"),
      episodios: [],
    };

    const scriptContent = $("script").text();
    const mediaMatch = scriptContent.match(
      /media:\s*\{[\s\S]*?episodesCount:\s*(\d+)[\s\S]*?slug:\s*"([^"]+)"/,
    );
    const hasEpisodeZero = /number:\s*0/.test(scriptContent);

    if (mediaMatch) {
      const totalEpisodes = parseInt(mediaMatch[1], 10);
      const slug = mediaMatch[2];
      const startEp = hasEpisodeZero ? 0 : 1;

      for (let i = startEp; i <= totalEpisodes; i++) {
        detalles.episodios.push({
          episodio: i,
          url: `/media/${slug}/${i}`,
        });
      }
    }
    return detalles;
  }

  async getEnlaces(urlEpisodio) {
    const { data } = await axios.get(`${this.baseUrl}${urlEpisodio}`);
    const $ = cheerio.load(data);

    let scriptHtml = "";
    $("script").each((i, el) => {
      if ($(el).html().includes("__sveltekit_")) scriptHtml = $(el).html();
    });

    const servidores = [];
    const regexServidores = /server\s*:\s*"(.*?)"\s*,\s*url\s*:\s*"(.*?)"/g;
    let match;

    while ((match = regexServidores.exec(scriptHtml)) !== null) {
      let urlFinal = match[2];

      // Extractor integrado para Zilla
      if (match[1].includes("HLS") || match[2].includes("zilla")) {
        const idVideo = match[2].substring(match[2].lastIndexOf("/") + 1);
        urlFinal = `https://player.zilla-networks.com/m3u8/${idVideo}`;
      }

      servidores.push({ nombre: match[1], url: urlFinal });
    }
    return servidores;
  }

  // Añade esto en AnimeAv1.js
  async getFiltros() {
    return [
      {
        id: "category",
        nombre: "Categoría",
        opciones: [
          { valor: "", etiqueta: "Todas" },
          { valor: "tv-anime", etiqueta: "TV Anime" },
          { valor: "pelicula", etiqueta: "Película" },
          { valor: "ova", etiqueta: "OVA" },
        ],
      },
      {
        id: "genre",
        nombre: "Género",
        opciones: [
          { valor: "", etiqueta: "Todos" },
          { valor: "accion", etiqueta: "Acción" },
          { valor: "aventura", etiqueta: "Aventura" },
          { valor: "ciencia-ficcion", etiqueta: "Ciencia Ficción" },
          { valor: "comedia", etiqueta: "Comedia" },
          { valor: "deportes", etiqueta: "Deportes" },
          { valor: "drama", etiqueta: "Drama" },
          { valor: "fantasia", etiqueta: "Fantasía" },
          { valor: "misterio", etiqueta: "Misterio" },
          { valor: "recuentos-de-la-vida", etiqueta: "Recuentos de la Vida" },
          { valor: "romance", etiqueta: "Romance" },
          { valor: "seinen", etiqueta: "Seinen" },
          { valor: "shoujo", etiqueta: "Shoujo" },
          { valor: "shounen", etiqueta: "Shounen" },
          { valor: "sobrenatural", etiqueta: "Sobrenatural" },
          { valor: "suspenso", etiqueta: "Suspenso" },
          { valor: "terror", etiqueta: "Terror" },
          { valor: "antropomorfico", etiqueta: "Antropomórfico" },
          { valor: "artes-marciales", etiqueta: "Artes Marciales" },
          { valor: "carreras", etiqueta: "Carreras" },
          { valor: "detectives", etiqueta: "Detectives" },
          { valor: "ecchi", etiqueta: "Ecchi" },
          { valor: "elenco-adulto", etiqueta: "Elenco Adulto" },
          { valor: "escolares", etiqueta: "Escolares" },
          { valor: "espacial", etiqueta: "Espacial" },
          { valor: "gore", etiqueta: "Gore" },
          { valor: "gourmet", etiqueta: "Gourmet" },
          { valor: "harem", etiqueta: "Harem" },
          { valor: "historico", etiqueta: "Histórico" },
          { valor: "idols-hombre", etiqueta: "Idols (Hombre)" },
          { valor: "idols-mujer", etiqueta: "Idols (Mujer)" },
          { valor: "infantil", etiqueta: "Infantil" },
          { valor: "isekai", etiqueta: "Isekai" },
          { valor: "josei", etiqueta: "Josei" },
          { valor: "juegos-estrategia", etiqueta: "Juegos Estrategia" },
          { valor: "mahou-shoujo", etiqueta: "Mahou Shoujo" },
          { valor: "mecha", etiqueta: "Mecha" },
          { valor: "militar", etiqueta: "Militar" },
          { valor: "mitologia", etiqueta: "Mitología" },
          { valor: "musica", etiqueta: "Música" },
          { valor: "parodia", etiqueta: "Parodia" },
          { valor: "psicologico", etiqueta: "Psicológico" },
          { valor: "samurai", etiqueta: "Samurai" },
          { valor: "shoujo-ai", etiqueta: "Shoujo Ai" },
          { valor: "shounen-ai", etiqueta: "Shounen Ai" },
          { valor: "superpoderes", etiqueta: "Superpoderes" },
          { valor: "vampiros", etiqueta: "Vampiros" },
        ],
      },
      {
        id: "status",
        nombre: "Estado",
        opciones: [
          { valor: "", etiqueta: "Todos" },
          { valor: "emision", etiqueta: "En Emisión" },
          { valor: "finalizado", etiqueta: "Finalizado" }
        ],
      },
    ];
  }
}

module.exports = AnimeAv1;
