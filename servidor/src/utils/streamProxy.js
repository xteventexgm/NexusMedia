const axios = require('axios');
const { UA } = require('./userAgent');

function isStreamUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase();
  return (
    /\.m3u8(\?|$)/i.test(u) ||
    /\.(ts|mp4|m4s|aac)(\?|$)/i.test(u) ||
    /acek-cdn\.com/i.test(u)
  );
}

function wrapStreamUrl(targetUrl, apiBase, referer) {
  const base = String(apiBase || '').replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('url', targetUrl);
  if (referer) params.set('referer', referer);
  return `${base}/api/stream/proxy?${params.toString()}`;
}

function resolvePlaylistUrl(relative, manifestUrl) {
  if (!relative) return relative;
  if (/^https?:\/\//i.test(relative)) return relative;
  const manifest = new URL(manifestUrl);
  if (relative.startsWith('/')) {
    return `${manifest.protocol}//${manifest.host}${relative}`;
  }
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  return new URL(relative, base).href;
}

function rewriteM3u8Playlist(body, manifestUrl, apiBase, referer) {
  const apiBaseClean = String(apiBase || '').replace(/\/$/, '');

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/gi, (_match, uri) => {
          const abs = resolvePlaylistUrl(uri, manifestUrl);
          return `URI="${wrapStreamUrl(abs, apiBaseClean, referer)}"`;
        });
      }

      const abs = resolvePlaylistUrl(trimmed, manifestUrl);
      return wrapStreamUrl(abs, apiBaseClean, referer);
    })
    .join('\n');
}

async function proxyStreamRequest(targetUrl, referer) {
  let defaultReferer = '';
  try {
    defaultReferer = `${new URL(targetUrl).origin}/`;
  } catch (_) {
    /* ignorar */
  }

  const response = await axios.get(targetUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': UA,
      Referer: referer || defaultReferer,
      Accept: '*/*'
    },
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400
  });

  return {
    data: response.data,
    contentType: response.headers['content-type'] || ''
  };
}

module.exports = {
  isStreamUrl,
  wrapStreamUrl,
  rewriteM3u8Playlist,
  proxyStreamRequest
};
