const config = require('../config/env');
const { extraerVideoDirecto } = require('./extractor');

function isHlsUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.m3u8(\?|$)/i.test(url) || /\/hls/i.test(url) || /acek-cdn\.com/i.test(url);
}

function isHlsServerEntry(entry) {
  if (!entry) return false;
  if (entry.hls) return true;
  const name = String(entry.nombre || entry.server || '').toLowerCase();
  if (/auto-play hls/i.test(name)) return true;
  return isHlsUrl(entry.url);
}

/**
 * Intenta resolver un embed (vidhide, streamwish, etc.) a URL HLS/MP4 directa.
 */
async function resolveEmbedToStream(embedUrl, options = {}) {
  const fetchReferer = options.fetchReferer || options.referer || embedUrl;
  const playbackReferer = options.referer || embedUrl;
  const label = options.label || 'Auto-Play HLS';
  const timeout = options.timeout || config.httpTimeoutMs;

  if (isHlsUrl(embedUrl)) {
    return {
      nombre: label,
      url: embedUrl,
      referer: playbackReferer,
      hls: true
    };
  }

  const directo = await extraerVideoDirecto(embedUrl, {
    referer: fetchReferer,
    timeout
  });
  if (!directo) return null;

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
  isHlsServerEntry,
  resolveEmbedToStream,
  iframeFallback,
  sortServersHlsFirst
};
