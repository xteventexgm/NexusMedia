const ProviderBase = require('./ProviderBase');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config/env');
const { extraerVideoDirecto, UA } = require('../utils/extractor');
const { extraerHlsP2pPlayDetailed } = require('../utils/p2pPlay');
const {
  buildProxyUrl,
  validateM3u8Fast,
  defaultReferer
} = require('../utils/streamProxy');

const SECCIONES = [
  { id: 'doramas', url: 'https://doramaslatinox.com/tipo/dorama/', etiqueta: 'Doramas' },
  { id: 'series', url: 'https://doramaslatinox.com/series/', etiqueta: 'Series' },
  { id: 'peliculas', url: 'https://doramaslatinox.com/movies/', etiqueta: 'Películas' },
  { id: 'emision', url: 'https://doramaslatinox.com/estado/emision/', etiqueta: 'En emisión' },
  { id: 'completo', url: 'https://doramaslatinox.com/estado/completo/', etiqueta: 'Completos' },
  { id: 'latino', url: 'https://doramaslatinox.com/audio/latino/', etiqueta: 'Latino' },
  { id: 'sub', url: 'https://doramaslatinox.com/audio/subtitulado/', etiqueta: 'Subtitulado' },
  { id: 'corea', url: 'https://doramaslatinox.com/pais/corea-del-sur/', etiqueta: 'Corea del Sur' },
  { id: 'china', url: 'https://doramaslatinox.com/pais/china/', etiqueta: 'China' },
  { id: 'japon', url: 'https://doramaslatinox.com/pais/japon/', etiqueta: 'Japón' }
];

const EMBED_TIMEOUT = Math.min(config.httpTimeoutMs, 15000);

class DoramasLatinoX extends ProviderBase {
  constructor() {
    super();
    this.id = 'doramaslatinox';
    this.nombre = 'DoramasLatinoX';
    this.icono = '🌺';
    this.color = '#f472b6';
    this.baseUrl = process.env.DORAMASLATINOX_URL || 'https://doramaslatinox.com';
  }

  headers(referer) {
    return {
      'User-Agent': UA,
      Accept: 'text/html,application/json,*/*',
      ...(referer ? { Referer: referer } : {})
    };
  }

  async fetchHtml(url, referer) {
    const { data } = await axios.get(url, {
      headers: this.headers(referer),
      timeout: EMBED_TIMEOUT
    });
    return cheerio.load(data);
  }

  fixUrl(href) {
    if (!href) return null;
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    return `${this.baseUrl.replace(/\/$/, '')}${href.startsWith('/') ? '' : '/'}${href}`;
  }

  parseMainItem(el, $) {
    const root = $(el);
    const titulo = root.find('div.data h3 a').text().trim();
    const href = this.fixUrl(root.find('div.poster a').attr('href'));
    if (!titulo || !href) return null;

    const poster =
      root.find('div.poster img').attr('src') ||
      root.find('div.poster img').attr('data-src') ||
      '';

    const esSerie = root.hasClass('tvshows');
    return {
      titulo,
      url: href,
      poster: this.fixUrl(poster) || poster,
      estado: esSerie ? 'Serie' : 'Película'
    };
  }

  async getFiltros() {
    return [
      {
        id: 'seccion',
        nombre: 'Sección',
        opciones: [
          { valor: '', etiqueta: 'Doramas (predeterminado)' },
          ...SECCIONES.map((s) => ({ valor: s.id, etiqueta: s.etiqueta }))
        ]
      }
    ];
  }

  seccionUrl(filtros = {}) {
    const id = filtros.seccion || 'doramas';
    const found = SECCIONES.find((s) => s.id === id);
    return found ? found.url : SECCIONES[0].url;
  }

  paginar(baseUrl, page) {
    if (page <= 1) return baseUrl;
    return `${baseUrl.replace(/\/$/, '')}/page/${page}/`;
  }

  async getCatalogo(filtros = {}, page = 1) {
    const url = this.paginar(this.seccionUrl(filtros), page);
    try {
      console.log('[DoramasLatinoX] Catálogo:', url);
      const $ = await this.fetchHtml(url);
      const resultados = [];
      $('article.item').each((_, el) => {
        const item = this.parseMainItem(el, $);
        if (item) resultados.push(item);
      });
      return resultados;
    } catch (error) {
      console.error('[DoramasLatinoX] getCatalogo:', error.message);
      return [];
    }
  }

  async getPopulares(page = 1) {
    return this.getCatalogo({ seccion: 'emision' }, page);
  }

  async buscar(query, page = 1) {
    const url =
      page <= 1
        ? `${this.baseUrl}/?s=${encodeURIComponent(query)}`
        : `${this.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;

    try {
      const $ = await this.fetchHtml(url);
      const resultados = [];

      $('div.result-item article').each((_, el) => {
        const root = $(el);
        const titleEl = root.find('div.details div.title a');
        const titulo = titleEl.text().trim();
        const href = this.fixUrl(titleEl.attr('href'));
        const poster = root.find('div.image div.thumbnail img').attr('src');
        if (titulo && href) {
          resultados.push({
            titulo,
            url: href,
            poster: this.fixUrl(poster) || poster,
            estado: 'Dorama'
          });
        }
      });

      return resultados;
    } catch (error) {
      console.error('[DoramasLatinoX] buscar:', error.message);
      return [];
    }
  }

  async getDetalles(urlPath) {
    const targetUrl = urlPath.startsWith('http') ? urlPath : this.fixUrl(urlPath);
    try {
      const $ = await this.fetchHtml(targetUrl);

      const titulo = $('h1').first().text().trim();
      if (!titulo) return { titulo: 'Sin título', sinopsis: '', poster: '', episodios: [] };

      const poster = $('meta[property="og:image"]').attr('content') || '';
      const sinopsis = ($('meta[property="og:description"]').attr('content') || '').trim();
      const yearText = $('div.extra span').first().text().trim();
      const yearMatch = yearText.match(/\d{4}/);
      const generos = [];
      $('div.sgeneros a').each((_, el) => generos.push($(el).text().trim()));
      const rating = $('span.dt_rating_vgs').text().trim();

      const detalles = {
        titulo,
        sinopsis,
        poster: this.fixUrl(poster) || poster,
        año: yearMatch ? yearMatch[0] : null,
        calificacion: rating ? `${rating}/10` : null,
        generos,
        estado: $('ul.episodios').length ? 'Serie' : 'Película',
        episodios: []
      };

      if ($('ul.episodios').length) {
        $('ul.episodios a').each((_, el) => {
          const a = $(el);
          const href = this.fixUrl(a.attr('href'));
          if (!href) return;

          const numText = a.find('div.numerando').text() || '';
          const parts = numText.split('-').map((s) => s.trim());
          const season = parseInt(parts[0], 10) || 1;
          const episode = parseInt(parts[parts.length - 1], 10) || 1;
          const epTitle = a.find('div.episodiotitle').contents().filter(function () {
            return this.type === 'text';
          }).text().trim();

          detalles.episodios.push({
            nombre: epTitle || `Episodio ${episode}`,
            temporada: season,
            episodio: episode,
            url: href
          });
        });
      } else {
        detalles.episodios.push({
          nombre: 'Película',
          episodio: 1,
          url: targetUrl
        });
      }

      return detalles;
    } catch (error) {
      console.error('[DoramasLatinoX] getDetalles:', error.message);
      throw error;
    }
  }

  async prepararHls(rawUrl, referer) {
    const ref = referer || defaultReferer(rawUrl);
    // Validación rápida: si devuelve null (timeout/error) NO descartamos la URL.
    // Solo descartamos si estamos SEGUROS de que no es un m3u8 válido (false explícito).
    const valido = await validateM3u8Fast(rawUrl, ref);
    if (valido === false) {
      console.log(`[DoramasLatinoX] HLS descartado (no es m3u8 válido): ${rawUrl.slice(0, 80)}`);
      return null;
    }
    if (valido === null) {
      console.log(`[DoramasLatinoX] HLS no verificable (timeout), proxy de todas formas: ${rawUrl.slice(0, 80)}`);
    }
    const proxied = buildProxyUrl(rawUrl, ref);
    return proxied || rawUrl;
  }

  esEmbedInutil(url) {
    return /p2pplay\.online/i.test(url) || /abyssplayer\.com/i.test(url);
  }

  async resolverP2pPlay(embedUrl, referer) {
    const hls = [];
    try {
      const entries = await extraerHlsP2pPlayDetailed(embedUrl, EMBED_TIMEOUT);
      let baseRef;
      try {
        const u = new URL(embedUrl.split('#')[0]);
        baseRef = `${u.protocol}//${u.host}/`;
      } catch {
        baseRef = referer;
      }

      for (const entry of entries) {
        const listo = await this.prepararHls(entry.url, baseRef);
        if (listo && !hls.some((s) => s.url === listo)) {
          hls.push({
            nombre: `Auto-Play HLS [${entry.label}]`,
            url: listo
          });
        }
      }
    } catch (e) {
      console.warn('[DoramasLatinoX] p2pplay:', e.message);
    }
    return hls;
  }

  async resolverEmbed(embedUrl, referer, etiqueta = '') {
    const hls = [];
    const iframes = [];

    const addHls = (url, nombre) => {
      if (!url || hls.some((s) => s.url === url)) return;
      hls.push({ nombre, url });
    };

    const addIframe = (url, nombre) => {
      if (!url || this.esEmbedInutil(url) || iframes.some((s) => s.url === url)) return;
      iframes.push({ nombre, url });
    };

    if (/p2pplay\.online/i.test(embedUrl)) {
      const streams = await this.resolverP2pPlay(embedUrl, referer);
      if (streams.length) return streams;
    }

    let target = embedUrl;
    if (!/\.m3u8|\.mp4|p2pplay\.online/i.test(embedUrl)) {
      try {
        const { data } = await axios.get(embedUrl, {
          headers: this.headers(referer),
          timeout: EMBED_TIMEOUT
        });
        const $ = cheerio.load(data);
        const iframe = $('iframe').attr('src');
        if (iframe) target = this.fixUrl(iframe) || iframe;
      } catch (_) {
        /* seguir */
      }
    }

    if (/p2pplay\.online/i.test(target)) {
      const streams = await this.resolverP2pPlay(target, referer);
      if (streams.length) return streams;
    }

    const directo = await extraerVideoDirecto(target);
    if (directo) {
      const listo = await this.prepararHls(directo, referer || defaultReferer(target));
      if (listo) {
        addHls(listo, 'Auto-Play HLS');
        return hls;
      }
      addHls(directo, 'Auto-Play HLS');
      return hls;
    }

    if (!this.esEmbedInutil(target)) {
      let host = 'Externo';
      try {
        host = new URL(target).hostname.split('.')[0];
      } catch (_) {}
      addIframe(target, `Iframe (${host})${etiqueta ? ` ${etiqueta}` : ''}`);
    }

    return iframes;
  }

  async getEnlaces(urlEpisodio) {
    const targetUrl = urlEpisodio.startsWith('http') ? urlEpisodio : this.fixUrl(urlEpisodio);
    const hlsOut = [];
    const iframeOut = [];
    const vistos = new Set();

    try {
      const $ = await this.fetchHtml(targetUrl);
      const opciones = [];

      $('li.dooplay_player_option').each((i, el) => {
        const opt = $(el);
        const post = opt.attr('data-post');
        const type = opt.attr('data-type');
        const nume = opt.attr('data-nume');
        if (post) opciones.push({ post, type, nume, idx: i + 1 });
      });

      const embedJobs = await Promise.all(
        opciones.map(async (opt) => {
          try {
            const apiUrl = `${this.baseUrl}/wp-json/dooplayer/v2/${opt.post}/${opt.type}/${opt.nume}`;
            const { data: apiData } = await axios.get(apiUrl, {
              headers: this.headers(targetUrl),
              timeout: EMBED_TIMEOUT
            });
            let embedUrl = apiData?.embed_url?.replace(/\\\//g, '/');
            if (!embedUrl) return null;
            embedUrl = this.fixUrl(embedUrl) || embedUrl;
            const resueltos = await this.resolverEmbed(embedUrl, targetUrl, `#${opt.nume || opt.idx}`);
            return { resueltos, nume: opt.nume || opt.idx };
          } catch (e) {
            console.warn('[DoramasLatinoX] dooplayer:', e.message);
            return null;
          }
        })
      );

      for (const job of embedJobs) {
        if (!job) continue;
        for (const srv of job.resueltos) {
          if (!srv.url || vistos.has(srv.url)) continue;
          vistos.add(srv.url);
          const entry = {
            nombre: srv.nombre.includes('#') ? srv.nombre : `${srv.nombre} (#${job.nume})`,
            url: srv.url
          };
          if (/Auto-Play HLS/i.test(srv.nombre)) hlsOut.push(entry);
          else iframeOut.push(entry);
        }
      }
    } catch (error) {
      console.error('[DoramasLatinoX] getEnlaces:', error.message);
    }

    if (hlsOut.length === 0 && iframeOut.length === 0) {
      console.warn(`[DoramasLatinoX] ⚠ Ningún servidor encontrado para: ${targetUrl.slice(0, 80)}`);
    } else {
      console.log(`[DoramasLatinoX] Servidores: ${hlsOut.length} HLS + ${iframeOut.length} iframe`);
    }

    return [...hlsOut, ...iframeOut];
  }
}

module.exports = DoramasLatinoX;
