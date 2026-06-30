const ProviderBase = require("./ProviderBase");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const config = require("../config/env");
const { fetchHtml } = require("../utils/httpRelay");
const { UA } = require("../utils/userAgent");
const {
  resolveEmbedToStream,
  iframeFallback,
  sortServersHlsFirst,
} = require("../utils/hlsResolver");

class PelisplusHD extends ProviderBase {
  constructor() {
    super();
    this.id = "pelisplushd";
    this.nombre = "PelisplusHD";
    this.icono = "🎬";
    this.color = "#f97316";
    this.baseUrl = "https://pelisplushd.bz";
  }

  async getFiltros() {
    return [
      {
        id: "categoria",
        nombre: "Categoría",
        opciones: [
          { valor: "", etiqueta: "Todos" },
          { valor: "peliculas", etiqueta: "Películas" },
          { valor: "series", etiqueta: "Series" },
          { valor: "animes", etiqueta: "Anime" },
        ],
      },
      {
        id: "genero",
        nombre: "Género",
        opciones: [
          { valor: "", etiqueta: "Todos" },
          { valor: "accion", etiqueta: "Acción" },
          { valor: "animacion", etiqueta: "Animación" },
          { valor: "aventura", etiqueta: "Aventura" },
          { valor: "belica", etiqueta: "Bélica" },
          { valor: "ciencia-ficcion", etiqueta: "Ciencia Ficción" },
          { valor: "comedia", etiqueta: "Comedia" },
          { valor: "crimen", etiqueta: "Crimen" },
          { valor: "documental", etiqueta: "Documental" },
          { valor: "drama", etiqueta: "Drama" },
          { valor: "fantasia", etiqueta: "Fantasía" },
          { valor: "familia", etiqueta: "Familia" },
          { valor: "guerra", etiqueta: "Guerra" },
          { valor: "historia", etiqueta: "Historia" },
          { valor: "misterio", etiqueta: "Misterio" },
          { valor: "romance", etiqueta: "Romance" },
          { valor: "suspense", etiqueta: "Suspense" },
          { valor: "terror", etiqueta: "Terror" },
          { valor: "western", etiqueta: "Western" },
          { valor: "dorama", etiqueta: "Doramas" },
        ],
      },
    ];
  }

  async getCatalogo(filtros = {}, page = 1) {
    let urlFinal = "";

    // PelisplusHD usa rutas distintas para géneros y categorías.
    // Si el usuario elige un género, usamos esa ruta específica.
    if (filtros.categoria && filtros.genero) {
      urlFinal = `${this.baseUrl}/generos/${filtros.genero}/${filtros.categoria}?page=${page}`;
    } else if (filtros.genero) {
      urlFinal = `${this.baseUrl}/generos/${filtros.genero}?page=${page}`;
    } else {
      let ruta = filtros.categoria || "peliculas";
      urlFinal = `${this.baseUrl}/${ruta}?page=${page}`;
    }

    console.log(`[PelisplusHD] Consultando: ${urlFinal}`);
    const { data } = await axios.get(urlFinal);
    const $ = cheerio.load(data);
    const resultados = [];

    $("a.Posters-link").each((i, el) => {
      const titulo = $(el).find(".listing-content p").text().trim();
      const url = $(el).attr("href");
      const poster = $(el).find(".Posters-img").attr("src");
      if (titulo && url) resultados.push({ titulo, url, poster });
    });

    return resultados;
  }

  async buscar(query, page = 1) {
    const { data } = await axios.get(
      `${this.baseUrl}/search?s=${encodeURIComponent(query)}&page=${page}`,
    );
    const $ = cheerio.load(data);
    const resultados = [];

    $("a.Posters-link").each((i, el) => {
      const titulo = $(el).find(".listing-content p").text().trim();
      const url = $(el).attr("href");
      const poster = $(el).find(".Posters-img").attr("src");
      if (titulo && url) resultados.push({ titulo, url, poster });
    });
    return resultados;
  }

  async getDetalles(urlPath) {
    const targetUrl = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // EXTRAER METADATOS
    const generos = [];
    $(".p-h-15.text-center a span.font-size-18").each((i, el) => {
      const gen = $(el).text().trim().replace(/,/g, "");
      if (gen) generos.push(gen);
    });

    // Francotirador Regex para limpiar el Rating de IMDb
    let calificacionLimpia = null;
    // Buscamos el patrón exacto en todo el HTML (ej: 6.4/10 o 6.421/10)
    const matchRating = $.html().match(/(\d+(?:\.\d+)?)\/10/);
    if (matchRating) {
      // Capturamos solo el número (ej: 6.421) y lo limitamos a 1 decimal para que se vea más estético
      const numero = parseFloat(matchRating[1]).toFixed(1);
      calificacionLimpia = `${numero}/10`;
    }

    const detalles = {
      titulo: $(".m-b-5").first().text().trim(),
      sinopsis: $("div.text-large").first().text().trim(),
      poster: $(".img-fluid").attr("src"),
      año: $(".p-r-15 .text-semibold").text().trim() || null,
      calificacion: calificacionLimpia,
      generos: generos,
      episodios: [],
    };
    const isMovie = targetUrl.includes("/pelicula/");

    if (isMovie) {
      detalles.episodios.push({
        nombre: "Película",
        episodio: 1,
        url: targetUrl,
      });
    } else {
      // CORRECCIÓN: Selector infalible para buscar todos los enlaces de episodios
      $('div.tab-pane a[href*="/capitulo/"]').each((i, el) => {
        const href = $(el).attr("href");
        let name = $(el).text().trim();
        name = name.replace(/T\d+.*E\d+:/, "").trim(); // Limpia "T1.E1: "

        const match = href.match(/temporada\/(\d+)\/capitulo\/(\d+)/);
        if (match) {
          detalles.episodios.push({
            nombre: name || `Capítulo ${match[2]}`,
            temporada: parseInt(match[1]),
            episodio: parseInt(match[2]),
            url: href.startsWith("http") ? href : `${this.baseUrl}${href}`,
          });
        }
      });
    }
    return detalles;
  }

  // ==========================================
  // EXTRACTOR CRIPTOGRÁFICO Y RESOLVEDOR
  // ==========================================
  derivarLlaveAes(challenge, difficulty, salt) {
    const prefix = "0".repeat(difficulty);
    let nonce = 0;

    while (true) {
      const hashHex = crypto
        .createHash("sha256")
        .update(challenge + nonce)
        .digest("hex");
      if (hashHex.startsWith(prefix)) {
        return crypto
          .createHash("sha256")
          .update(challenge + nonce + salt)
          .digest();
      }
      nonce++;
      if (nonce > 1000000) return null; // Seguridad anti-cuelgues
    }
  }

  desencriptarAES(encryptedBase64, aesKey) {
    try {
      const raw = Buffer.from(encryptedBase64, "base64");
      const iv = raw.subarray(0, 16);
      const ciphertext = raw.subarray(16);
      const keyBytes = aesKey.subarray(0, 32);

      // Método seguro de desencriptación en Buffer para Node.js
      const decipher = crypto.createDecipheriv("aes-256-cbc", keyBytes, iv);
      const decryptedBuffer = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decryptedBuffer.toString("utf8");
    } catch (e) {
      return null;
    }
  }

  fixHostsLinks(url) {
    return url
      .replace("https://hglink.to", "https://streamwish.to")
      .replace("https://mivalyo.com", "https://vidhidepro.com")
      .replace("https://dinisglows.com", "https://vidhidepro.com")
      .replace("https://dhtpre.com", "https://vidhidepro.com")
      .replace("https://filemoon.link", "https://filemoon.sx")
      .replace("https://sblona.com", "https://watchsb.com");
  }

  extraerDataLinkJson(html) {
    const idx = html.indexOf("dataLink = ");
    if (idx === -1) return null;
    const start = html.indexOf("[", idx);
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < html.length; i++) {
      if (html[i] === "[") depth++;
      else if (html[i] === "]") {
        depth--;
        if (depth === 0) return html.slice(start, i + 1);
      }
    }
    return null;
  }

  httpOpts(referer) {
    return {
      timeout: config.httpTimeoutMs,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
    };
  }

  async procesarEmbed69(embedUrl) {
    const servidores = [];
    console.log("[embed69] URL:", embedUrl);
    const embedHtml = await fetchHtml(embedUrl, {
      referer: this.baseUrl,
      timeout: config.httpTimeoutMs,
    });

    const challengeMatch = embedHtml.match(/const POW_CHALLENGE = '([^']+)'/);
    const diffMatch = embedHtml.match(/const POW_DIFFICULTY = (\d+)/);
    const saltMatch = embedHtml.match(/const POW_SALT = '([^']+)'/);
    const dataLinkJson =
      this.extraerDataLinkJson(embedHtml) ||
      embedHtml.match(/dataLink = (\[[\s\S]*?\]);/)?.[1];

    if (!challengeMatch || !diffMatch || !saltMatch || !dataLinkJson) {
      console.warn("[PelisplusHD] embed69: faltan POW o dataLink");
      return servidores;
    }

    const aesKey = this.derivarLlaveAes(
      challengeMatch[1],
      parseInt(diffMatch[1], 10),
      saltMatch[1],
    );
    if (!aesKey) {
      console.warn("[PelisplusHD] embed69: PoW sin solución");
      return servidores;
    }

    let dataLink;
    try {
      dataLink = JSON.parse(dataLinkJson);
    } catch (e) {
      console.warn("[PelisplusHD] embed69: JSON inválido", e.message);
      return servidores;
    }

    const tareas = [];
    for (const lang of dataLink) {
      const idioma = lang.video_language || "Latino";
      for (const embed of lang.sortedEmbeds || []) {
        tareas.push(async () => {
          const linkLimpio = this.desencriptarAES(embed.link, aesKey);
          if (!linkLimpio) return null;

          const urlReal = this.fixHostsLinks(linkLimpio);
          console.log("[embed69] URL:", urlReal);
          const hls = await resolveEmbedToStream(urlReal, {
            label: `Auto-Play HLS [${idioma}]`,
            referer: urlReal,
            fetchReferer: embedUrl,
          });
          if (hls) return hls;

          let host = embed.servername || "Externo";
          try {
            host = new URL(urlReal).hostname.split(".")[0];
          } catch (_) {}
          return iframeFallback(urlReal, `Servidor: ${host} [${idioma}]`);
        });
      }
    }

    const resultados = await Promise.allSettled(tareas.map((fn) => fn()));
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value) servidores.push(r.value);
    }

    return sortServersHlsFirst(
      servidores.map(({ nombre, url, referer, hls }) => ({
        nombre,
        url,
        referer,
        hls,
      })),
    );
  }

  async getEnlaces(urlEpisodio) {
    const targetUrl = urlEpisodio.startsWith("http")
      ? urlEpisodio
      : `${this.baseUrl}${urlEpisodio}`;
    const servidores = [];

    try {
      console.log("[embed69] URL:", targetUrl);
      const { data } = await axios.get(targetUrl, this.httpOpts(this.baseUrl));
      const $ = cheerio.load(data);

      const scriptHtml =
        $("script")
          .filter((i, el) => $(el).html().includes("var video ="))
          .html() || "";
      let urlsCrudas = scriptHtml.match(/https?:\/\/[^"'\s<>]+/g) || [];
      urlsCrudas = [...new Set(urlsCrudas)];

      if (!urlsCrudas.length) {
        console.warn("[PelisplusHD] getEnlaces: sin URLs en var video =");
      }

      for (let i = 0; i < urlsCrudas.length; i++) {
        const url = urlsCrudas[i];

        if (url.includes("xupalace") || url.includes("uqlink")) {
          try {
            console.log("[embed69] URL:", url);
            const resXu = await axios.get(url, this.httpOpts(this.baseUrl));
            const matchGoTo = resXu.data.match(
              /(?:go_to_player|go_to_playerVast)\('([^']+)'/,
            );
            if (matchGoTo && matchGoTo[1]) {
              urlsCrudas.push(this.fixHostsLinks(matchGoTo[1]));
            } else {
              const iframeSrc = cheerio.load(resXu.data)("iframe").attr("src");
              if (iframeSrc) urlsCrudas.push(this.fixHostsLinks(iframeSrc));
            }
          } catch (_) {}
        } else if (url.includes("embed69")) {
          try {
            const embedServidores = await this.procesarEmbed69(url);
            servidores.push(...embedServidores);
          } catch (e) {
            console.warn("[PelisplusHD] embed69:", e.message);
          }
        } else if (/vidhide|streamwish|filemoon|streamtape|strtape|stape|minochinos|uqload|dood|voe/i.test(url)) {
          let host = "Externo";
          try {
            host = new URL(url).hostname.split(".")[0];
          } catch (_) {}
          console.log("[embed69] URL:", url);
          const hls = await resolveEmbedToStream(url, {
            label: `Auto-Play HLS [${host}]`,
            referer: this.baseUrl,
          });
          if (hls) {
            servidores.push(hls);
          } else {
            servidores.push(iframeFallback(url, `Servidor Externo: ${host}`));
          }
        }
      }
    } catch (error) {
      console.error("[PelisplusHD] getEnlaces:", error.message);
    }

    return sortServersHlsFirst(servidores);
  }
}

module.exports = PelisplusHD;
