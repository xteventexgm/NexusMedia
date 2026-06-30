const { fetchHtml } = require('./httpRelay');
const { UA } = require('./userAgent');
const { isEmbedPageUrl, isStreamUrl } = require('./streamProxy');

const EMBED_HOST_RE =
  /streamwish|vidhide|minochinos|filemoon|streamtape|strtape|stape|uqload|dood|voe\.sx|bysedikamoum|hglink|mivalyo|dinisglows|dhtpre|tapecontent|watchsb/i;

function desempaquetarPacker(html) {
  const decodificados = [];
  const re = /\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g;
  let m;

  while ((m = re.exec(html)) !== null) {
    const p = m[1];
    const a = parseInt(m[2], 10);
    const k = m[4].split('|');
    const lookup = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const dec = p.replace(/\b\w+\b/g, (token) => {
      let idx = 0;
      for (let i = 0; i < token.length; i++) idx = idx * a + lookup.indexOf(token[i]);
      return k[idx] || token;
    });
    decodificados.push(dec);
  }

  return decodificados.join('\n');
}

function extraerStreamtape(html) {
  const m = html.match(/robotlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']*)'/);
  if (!m) return null;
  let parte2 = m[2].substring(3);
  let url = m[1] + parte2;
  if (url.startsWith('//')) url = 'https:' + url;
  return url + (url.includes('?') ? '&' : '?') + 'stream=1';
}

function buscarUrlVideo(texto) {
  if (!texto) return null;
  const matchM3u8 = texto.match(/(https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i);
  if (matchM3u8) return matchM3u8[1];
  const matchMp4 = texto.match(/(https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*)/i);
  if (matchMp4) return matchMp4[1];
  const matchFile = texto.match(/["']?file["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
  if (matchFile) return matchFile[1];
  const matchHlsSource = texto.match(/["']?hls(?:_source|Url)?["']?\s*:\s*["']([^"']+)["']/i);
  if (matchHlsSource) return matchHlsSource[1];
  return null;
}

function logExtractor(stage, embedUrl, extra = {}) {
  console.log('[extraerVideoDirecto]', stage, { embedUrl, ...extra });
}

/**
 * Dado un embed de host conocido, devuelve URL HLS/MP4 directa o null.
 */
async function extraerVideoDirecto(embedUrl, options = {}) {
  const referer = options.referer || embedUrl;
  const timeout = options.timeout || 15000;

  logExtractor('inicio', embedUrl, { referer, timeout });

  if (isStreamUrl(embedUrl) && !isEmbedPageUrl(embedUrl)) {
    logExtractor('ya-es-stream', embedUrl, { urlFinal: embedUrl });
    return embedUrl;
  }

  try {
    const html = await fetchHtml(embedUrl, { referer, timeout });

    if (/streamtape|strtape|stape|tapecontent/i.test(embedUrl) || /robotlink/.test(html)) {
      const st = extraerStreamtape(html);
      if (st) {
        logExtractor('streamtape', embedUrl, { urlFinal: st.slice(0, 120) });
        return st;
      }
    }

    const directo = buscarUrlVideo(html);
    if (directo) {
      logExtractor('html-directo', embedUrl, { urlFinal: directo.slice(0, 120) });
      return directo;
    }

    const desempaquetado = desempaquetarPacker(html);
    const enPacker = buscarUrlVideo(desempaquetado);
    if (enPacker) {
      logExtractor('packer', embedUrl, { urlFinal: enPacker.slice(0, 120) });
      return enPacker;
    }

    logExtractor('sin-resultado', embedUrl);
    return null;
  } catch (error) {
    console.error('[extraerVideoDirecto] error', {
      embedUrl,
      referer,
      status: error.response?.status,
      contentType: error.response?.headers?.['content-type'],
      headers: error.response?.headers,
      message: error.message
    });
    return null;
  }
}

function needsExtraction(url) {
  if (!url) return false;
  return isEmbedPageUrl(url) || EMBED_HOST_RE.test(url);
}

module.exports = {
  extraerVideoDirecto,
  desempaquetarPacker,
  buscarUrlVideo,
  extraerStreamtape,
  needsExtraction,
  UA
};
