const axios = require('axios');
const config = require('../config/env');
const { UA } = require('./userAgent');

/** Hosts cuyas páginas /e/ o /embed/ NO son streams directos. */
const EMBED_PAGE_HOSTS =
  /streamwish|vidhide|minochinos|filemoon|streamtape|strtape|stape|uqload|dood|voe\.sx|bysedikamoum|hglink|mivalyo|dinisglows|dhtpre/i;

/**
 * URL de página embed (no reproducible directamente).
 */
function isEmbedPageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase();
  if (/\.m3u8(\?|$)/i.test(u)) return false;
  if (/\/(e|embed|f)\/[\w-]+/i.test(u)) return true;
  if (EMBED_PAGE_HOSTS.test(u) && !/\.(m3u8|mp4|ts)(\?|$)/i.test(u)) return true;
  return false;
}

/**
 * URL de stream directo que debe pasar por el proxy HLS.
 */
function isStreamUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (isEmbedPageUrl(url)) return false;

  const u = url.toLowerCase();
  return (
    /\.m3u8(\?|$|#)/i.test(u) ||
    /\.(ts|mp4|m4s|aac|mkv|webm)(\?|$)/i.test(u) ||
    /acek-cdn\.com/i.test(u) ||
    /\/hls\//i.test(u) ||
    /master\.m3u8/i.test(u) ||
    /get_video/i.test(u) ||
    /zilla-networks\.com\/m3u8/i.test(u) ||
    /\/proxy\/.*\.m3u8/i.test(u)
  );
}

function isInvalidPublicBase(url) {
  if (!url) return true;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i.test(url);
}

/**
 * Base pública para wrapStreamUrl. En producción exige NEXUS_PUBLIC_URL.
 */
function resolvePublicApiBase(req) {
  const configured = (config.nexusPublicUrl || '').replace(/\/$/, '');
  const isProd = config.isProduction || !!process.env.RENDER;

  if (configured && !isInvalidPublicBase(configured)) {
    return configured;
  }

  if (isProd) {
    console.error(
      '[streamProxy] FALTA NEXUS_PUBLIC_URL en producción. ' +
        'Configure NEXUS_PUBLIC_URL=https://su-dominio-publico.com para que el proxy HLS funcione en clientes remotos (WebOS/TV).'
    );
  }

  const fallback = req
    ? `${req.protocol}://${req.get('host')}`.replace(/\/$/, '')
    : '';

  if (fallback && !isInvalidPublicBase(fallback)) {
    if (isProd) {
      console.warn('[streamProxy] Usando Host de la petición como fallback:', fallback);
    }
    return fallback;
  }

  if (fallback && isInvalidPublicBase(fallback)) {
    console.warn(
      '[streamProxy] apiBase inválido para proxy HLS (localhost/0.0.0.0):',
      fallback,
      '— configure NEXUS_PUBLIC_URL'
    );
  }

  return configured || null;
}

function wrapStreamUrl(targetUrl, apiBase, referer) {
  if (!apiBase || isInvalidPublicBase(apiBase)) {
    console.warn('[streamProxy] wrapStreamUrl omitido — apiBase inválido:', apiBase);
    return targetUrl;
  }

  const base = String(apiBase).replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('url', targetUrl);
  if (referer) params.set('referer', referer);
  return `${base}/api/stream/proxy?${params.toString()}`;
}

function resolvePlaylistUrl(relative, manifestUrl) {
  if (!relative) return relative;
  const clean = relative.trim();
  if (/^https?:\/\//i.test(clean)) return clean;
  const manifest = new URL(manifestUrl);
  if (clean.startsWith('/')) {
    return `${manifest.protocol}//${manifest.host}${clean}`;
  }
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  return new URL(clean, base).href;
}

function rewriteTagUris(line, manifestUrl, apiBase, referer) {
  return line.replace(/URI=(?:"([^"]+)"|'([^']+)')/gi, (_match, u1, u2) => {
    const uri = (u1 || u2 || '').trim();
    if (!uri) return _match;
    const abs = resolvePlaylistUrl(uri, manifestUrl);
    return `URI="${wrapStreamUrl(abs, apiBase, referer)}"`;
  });
}

function rewriteM3u8Playlist(body, manifestUrl, apiBase, referer) {
  if (!apiBase || isInvalidPublicBase(apiBase)) {
    console.warn('[rewriteM3u8Playlist] apiBase inválido — manifest sin reescribir');
    return body;
  }

  const apiBaseClean = String(apiBase).replace(/\/$/, '');
  const lines = body.split(/\r?\n/);
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith('#')) {
      out.push(rewriteTagUris(trimmed, manifestUrl, apiBaseClean, referer));
      continue;
    }

    // Línea de URL: sub-playlist .m3u8 o segmento .ts/.mp4
    const abs = resolvePlaylistUrl(trimmed, manifestUrl);
    out.push(wrapStreamUrl(abs, apiBaseClean, referer));
  }

  return out.join('\n');
}

function buildProxyHeaders(referer, defaultReferer) {
  const ref = referer || defaultReferer || '';
  const origin = ref ? ref.replace(/\/[^/]*$/, '/') : ref;
  return {
    'User-Agent': UA,
    Referer: ref,
    Origin: origin || ref,
    Accept: '*/*',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
  };
}

async function proxyStreamRequest(targetUrl, referer) {
  let defaultReferer = '';
  try {
    defaultReferer = `${new URL(targetUrl).origin}/`;
  } catch (_) {
    /* ignorar */
  }

  const effectiveReferer = referer || defaultReferer;
  console.log('[HLS Proxy] request', {
    url: targetUrl,
    referer: effectiveReferer
  });

  try {
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: buildProxyHeaders(referer, defaultReferer),
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const contentType = response.headers['content-type'] || '';
    console.log('[HLS Proxy] response', {
      url: targetUrl,
      status: response.status,
      contentType,
      bytes: response.data?.byteLength || response.data?.length || 0
    });

    return {
      data: response.data,
      contentType,
      status: response.status
    };
  } catch (error) {
    console.error('[HLS Proxy]', {
      url: targetUrl,
      referer: effectiveReferer,
      status: error.response?.status,
      contentType: error.response?.headers?.['content-type'],
      headers: error.response?.headers,
      message: error.message
    });
    throw error;
  }
}

module.exports = {
  isStreamUrl,
  isEmbedPageUrl,
  isInvalidPublicBase,
  resolvePublicApiBase,
  wrapStreamUrl,
  rewriteM3u8Playlist,
  proxyStreamRequest,
  buildProxyHeaders
};
