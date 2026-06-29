const axios = require('axios');
const { UA } = require('./extractor');

const ALLOWED_HOSTS = [
  'p2pplay.online',
  'cloudflare',
  'cloudfront.net',
  'akamaized.net',
  'fastly.net',
  'globalcdn',
  'm3u8',
  'bytefcdn',
  'cdn77',
  'workers.dev',
  // CDNs adicionales usados por providers de doramas / anime
  'ggvideo',
  'googlevideo',
  'bicdn.net',
  'streamhub',
  'cdnfile',
  'mixdrop',
  'kwik',
  'rapid',
  'sbembed',
  'streamsb',
  'vidhide',
  'filemoon',
  'streamwish',
  'wishembed',
  'sfastwish',
  'playerwish',
  'embedwish',
  'streamtape',
  'stape.fun',
  'uqload',
  'dood',
  'voe.sx'
];

function isAllowedStreamUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => host.includes(h)) || /\.m3u8|\.ts|\.m4s|\.mp4/i.test(url);
  } catch {
    return false;
  }
}

function defaultReferer(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('p2pplay.online')) {
      return `${u.protocol}//${u.host}/`;
    }
    return `${u.protocol}//${u.host}/`;
  } catch {
    return '';
  }
}

function resolvePlaylistUrl(baseUrl, line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  return new URL(trimmed, base).href;
}

let _warnedMissingPublicUrl = false;

function getPublicApiBase() {
  const raw =
    process.env.NEXUS_PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RAILWAY_STATIC_URL ||
    '';
  if (!raw && !_warnedMissingPublicUrl) {
    _warnedMissingPublicUrl = true;
    console.warn(
      '[StreamProxy] ⚠ NEXUS_PUBLIC_URL no está configurada. ' +
      'El proxy HLS NO podrá reescribir URLs → los CDNs que requieren Referer fallarán. ' +
      'Configura NEXUS_PUBLIC_URL con la URL pública de tu servidor (ej: https://tu-app.onrender.com).'
    );
  }
  return raw.replace(/\/$/, '');
}

function buildProxyUrl(targetUrl, referer, apiBase) {
  const base = apiBase || getPublicApiBase();
  if (!base) return targetUrl;
  const params = new URLSearchParams({ url: targetUrl });
  if (referer) params.set('referer', referer);
  return `${base}/api/stream/proxy?${params.toString()}`;
}

function rewriteM3u8Playlist(body, playlistUrl, referer, apiBase) {
  const base = getPublicApiBase() || apiBase;
  if (!base) return body;

  return body
    .split('\n')
    .map((line) => {
      if (line.trim().startsWith('#')) return line;
      const resolved = resolvePlaylistUrl(playlistUrl, line);
      if (!resolved) return line;
      if (/\.m3u8|\.ts|\.m4s|\.mp4/i.test(resolved)) {
        return buildProxyUrl(resolved, referer, base);
      }
      return line;
    })
    .join('\n');
}

async function fetchStreamResource(url, referer) {
  const ref = referer || defaultReferer(url);
  const isManifest = /\.m3u8(\?|$)/i.test(url);

  const response = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Referer: ref,
      Accept: isManifest ? 'application/vnd.apple.mpegurl,*/*' : '*/*'
    },
    timeout: 25000,
    responseType: isManifest ? 'text' : 'arraybuffer',
    validateStatus: (s) => s >= 200 && s < 400
  });

  return { data: response.data, isManifest, contentType: response.headers['content-type'] };
}

async function validateM3u8(url, referer) {
  try {
    const { data, isManifest } = await fetchStreamResource(url, referer);
    return isManifest && typeof data === 'string' && data.includes('#EXTM3U');
  } catch {
    return false;
  }
}

/**
 * Validación rápida (timeout corto) para no bloquear la respuesta al frontend.
 * Devuelve true/false/null (null = no se pudo determinar, tratar como válido).
 */
async function validateM3u8Fast(url, referer) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': UA,
        Referer: referer || defaultReferer(url),
        Accept: 'application/vnd.apple.mpegurl,*/*'
      },
      timeout: 5000,
      responseType: 'text',
      validateStatus: (s) => s >= 200 && s < 400
    });
    return typeof response.data === 'string' && response.data.includes('#EXTM3U');
  } catch {
    return null; // No se pudo determinar → no descartar
  }
}

module.exports = {
  isAllowedStreamUrl,
  defaultReferer,
  buildProxyUrl,
  rewriteM3u8Playlist,
  fetchStreamResource,
  validateM3u8,
  validateM3u8Fast,
  getPublicApiBase
};
