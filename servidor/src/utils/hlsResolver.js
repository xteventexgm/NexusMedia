const config = require('../config/env');
const { extraerVideoDirecto, needsExtraction } = require('./extractor');
const { isStreamUrl, isEmbedPageUrl } = require('./streamProxy');

function isHlsUrl(url) {
  return isStreamUrl(url);
}

function isPlayableStreamUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (isEmbedPageUrl(url)) return false;
  return isStreamUrl(url);
}

function isHlsServerEntry(entry) {
  if (!entry) return false;
  if (entry.hls && isPlayableStreamUrl(entry.url)) return true;
  const name = String(entry.nombre || entry.server || '').toLowerCase();
  if (/auto-play hls/i.test(name) && isPlayableStreamUrl(entry.url)) return true;
  return isPlayableStreamUrl(entry.url);
}

/**
 * Resuelve embed → stream directo (.m3u8 / .mp4). Nunca devuelve páginas /e/ como HLS.
 */
async function resolveEmbedToStream(embedUrl, options = {}) {
  const fetchReferer = options.fetchReferer || options.referer || embedUrl;
  const playbackReferer = options.referer || embedUrl;
  const label = options.label || 'Auto-Play HLS';
  const timeout = options.timeout || config.httpTimeoutMs;

  console.log('[hlsResolver] resolve', {
    embedUrl,
    fetchReferer,
    playbackReferer,
    label
  });

  if (isPlayableStreamUrl(embedUrl)) {
    const entry = {
      nombre: label,
      url: embedUrl,
      referer: playbackReferer,
      hls: true
    };
    console.log('[hlsResolver] stream directo', { urlFinal: embedUrl });
    return entry;
  }

  if (!needsExtraction(embedUrl) && !isEmbedPageUrl(embedUrl)) {
    console.warn('[hlsResolver] URL no reconocida como embed ni stream:', embedUrl);
    return null;
  }

  const directo = await extraerVideoDirecto(embedUrl, {
    referer: fetchReferer,
    timeout
  });

  if (!directo || !isPlayableStreamUrl(directo)) {
    console.warn('[hlsResolver] extracción fallida o no es stream', {
      embedUrl,
      directo: directo ? directo.slice(0, 80) : null
    });
    return null;
  }

  console.log('[hlsResolver] resuelto', {
    embedUrl,
    urlFinal: directo.slice(0, 120),
    referer: playbackReferer
  });

  return {
    nombre: label,
    url: directo,
    referer: playbackReferer,
    hls: true
  };
}

function iframeFallback(embedUrl, label) {
  let host = 'Externo';
  try {
    host = new URL(embedUrl).hostname.split('.')[0];
  } catch (_) {
    /* ignorar */
  }
  return {
    nombre: label || `Servidor: ${host}`,
    url: embedUrl,
    hls: false
  };
}

function sortServersHlsFirst(servers) {
  return [...servers].sort((a, b) => {
    const hlsA = isHlsServerEntry(a) ? 1 : 0;
    const hlsB = isHlsServerEntry(b) ? 1 : 0;
    if (hlsB !== hlsA) return hlsB - hlsA;

    const nameA = String(a.nombre || '').toLowerCase();
    const nameB = String(b.nombre || '').toLowerCase();
    const latA = /\[lat\]|latino|latam|español|castellano/.test(nameA) ? 1 : 0;
    const latB = /\[lat\]|latino|latam|español|castellano/.test(nameB) ? 1 : 0;
    return latB - latA;
  });
}

module.exports = {
  isHlsUrl,
  isPlayableStreamUrl,
  isHlsServerEntry,
  resolveEmbedToStream,
  iframeFallback,
  sortServersHlsFirst
};
