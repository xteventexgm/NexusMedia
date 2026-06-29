const ProviderBase = require('./ProviderBase');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const config = require('../config/env');
const { extraerVideoDirecto, UA, buscarUrlVideo } = require('../utils/extractor');

const P2P_KEY = 'kiemtienmua911ca';
const P2P_IVS = ['1234567890oiuytr', '0123456789abcdef'];
const P2P_DEFAULT = 'https://doramasfoxito.p2pplay.online';

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

function decryptP2pHex(inputHex, key, iv) {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from(key, 'utf8'),
    Buffer.from(iv, 'utf8')
  );
  return Buffer.concat([
    decipher.update(Buffer.from(inputHex, 'hex')),
    decipher.final()
  ]).toString('utf8');
}

function resolveP2pUrl(base, path) {
  if (!path) return null;
  const clean = String(path).replace(/\\\//g, '/');
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('//')) return `https:${clean}`;
  const origin = base.replace(/\/$/, '');
  return `${origin}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

function extractM3u8FromP2p(decrypted, base) {
  try {
    const parsed = JSON.parse(decrypted);
    if (parsed.source) return resolveP2pUrl(base, parsed.source);
  } catch (_) {
    /* continuar con regex */
  }

  const fromField = decrypted.match(/"source"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (fromField) {
    const resolved = resolveP2pUrl(base, fromField[1]);
    if (resolved) return resolved;
  }

  const direct = buscarUrlVideo(decrypted);
  if (direct) return direct;

  const rel = decrypted.match(/"source"\s*:\s*"(\/[^"]+\.m3u8[^"]*)"/i);
  if (rel) return resolveP2pUrl(base, rel[1]);

  const anyRel = decrypted.match(/(\/[A-Za-z0-9_\-/]+\.m3u8[^\s"']*)/i);
  if (anyRel) return resolveP2pUrl(base, anyRel[1]);

  return null;
}

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
      timeout: config.httpTimeoutMs
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

  async extraerP2pPlay(embedUrl) {
    try {
      const hash = embedUrl.includes('#')
        ? embedUrl.substring(embedUrl.lastIndexOf('#') + 1)
        : embedUrl.substring(embedUrl.lastIndexOf('/') + 1);

      let base;
      try {
        const u = new URL(embedUrl);
        base = `${u.protocol}//${u.host}`;
      } catch {
        base = P2P_DEFAULT;
      }

      const { data: encoded } = await axios.get(`${base}/api/v1/video?id=${hash}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0'
        },
        timeout: config.httpTimeoutMs
      });

      const hex = String(encoded).trim();
      for (const iv of P2P_IVS) {
        try {
          const decrypted = decryptP2pHex(hex, P2P_KEY, iv);
          const m3u8 = extractM3u8FromP2p(decrypted, base);
          if (m3u8) return m3u8;
        } catch (_) {
          /* probar siguiente IV */
        }
      }
    } catch (e) {
      console.warn('[DoramasLatinoX] p2pplay:', e.message);
    }
    return null;
  }

  async resolverEmbed(embedUrl, referer) {
    const servidores = [];

    if (/p2pplay\.online/i.test(embedUrl)) {
      const m3u8 = await this.extraerP2pPlay(embedUrl);
      if (m3u8) {
        servidores.push({ nombre: 'Auto-Play HLS [LatinoX]', url: m3u8 });
        return servidores;
      }
    }

    let iframeUrl = embedUrl;
    try {
      if (!/\.m3u8|\.mp4/i.test(embedUrl)) {
        const $ = await this.fetchHtml(embedUrl, referer);
        const iframe = $('iframe').attr('src');
        if (iframe) iframeUrl = this.fixUrl(iframe) || iframe;
      }
    } catch (_) {
      /* usar embedUrl original */
    }

    if (/p2pplay\.online/i.test(iframeUrl)) {
      const m3u8 = await this.extraerP2pPlay(iframeUrl);
      if (m3u8) {
        servidores.push({ nombre: 'Auto-Play HLS [LatinoX]', url: m3u8 });
        return servidores;
      }
    }

    const directo = await extraerVideoDirecto(iframeUrl);
    if (directo) {
      servidores.push({ nombre: 'Auto-Play HLS', url: directo });
    } else {
      let host = 'Externo';
      try {
        host = new URL(iframeUrl).hostname.split('.')[0];
      } catch (_) {}
      servidores.push({ nombre: `Iframe (${host})`, url: iframeUrl });
    }

    return servidores;
  }

  async getEnlaces(urlEpisodio) {
    const targetUrl = urlEpisodio.startsWith('http') ? urlEpisodio : this.fixUrl(urlEpisodio);
    const servidores = [];
    const vistos = new Set();

    try {
      const $ = await this.fetchHtml(targetUrl);
      const opciones = $('li.dooplay_player_option');

      for (let i = 0; i < opciones.length; i++) {
        const opt = $(opciones[i]);
        const post = opt.attr('data-post');
        const type = opt.attr('data-type');
        const nume = opt.attr('data-nume');
        if (!post) continue;

        try {
          const apiUrl = `${this.baseUrl}/wp-json/dooplayer/v2/${post}/${type}/${nume}`;
          const { data: apiData } = await axios.get(apiUrl, {
            headers: this.headers(targetUrl),
            timeout: config.httpTimeoutMs
          });

          let embedUrl = apiData?.embed_url?.replace(/\\\//g, '/');
          if (!embedUrl) continue;

          embedUrl = this.fixUrl(embedUrl) || embedUrl;
          const resueltos = await this.resolverEmbed(embedUrl, targetUrl);

          for (const srv of resueltos) {
            if (!srv.url || vistos.has(srv.url)) continue;
            vistos.add(srv.url);
            servidores.push({
              nombre: `${srv.nombre} (#${nume || i + 1})`,
              url: srv.url
            });
          }
        } catch (e) {
          console.warn('[DoramasLatinoX] dooplayer:', e.message);
        }
      }
    } catch (error) {
      console.error('[DoramasLatinoX] getEnlaces:', error.message);
    }

    return servidores;
  }
}

module.exports = DoramasLatinoX;
