const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config/env');
const { fetchHtml } = require('./httpRelay');
const { UA } = require('./userAgent');
const { isEmbedPageUrl, isStreamUrl } = require('./streamProxy');

const EMBED_HOST_RE =
  /streamwish|vidhide|minochinos|filemoon|streamtape|strtape|stape|uqload|dood|voe\.sx|bysedikamoum|hglink|mivalyo|dinisglows|dhtpre|tapecontent|watchsb|filelions/i;

const CHROME_EMBED_HOSTS =
  /streamwish|filelions|bysedikamoum|filemoon|voe\.sx|vidhide|minochinos|uqload|dood|hglink/i;

const MAX_JS_REDIRECTS = 3;

// ─── Utilidades ─────────────────────────────────────────────────────────────

function normalizeMediaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim().replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  if (u.startsWith('//')) u = `https:${u}`;
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

function isMediaUrl(url) {
  const u = normalizeMediaUrl(url);
  if (!u) return false;
  return /\.m3u8(\?|$)/i.test(u) || /\.mp4(\?|$)/i.test(u) || /\/hls\//i.test(u) || /acek-cdn\.com/i.test(u);
}

function logExtractor(stage, embedUrl, extra = {}) {
  console.log(`[extraerVideoDirecto] ${stage}`, { embedUrl, ...extra });
}

function logMotivoFallo(embedUrl, motivo, extra = {}) {
  console.log('[extraerVideoDirecto] motivo-fallo', { embedUrl, motivo, ...extra });
}

function saveDebugHtml(embedUrl, html) {
  if (!html) return;
  try {
    const host = new URL(embedUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
    const dir = path.join(config.dataDir, 'debug', 'extractors');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${host}-${Date.now()}.html`);
    fs.writeFileSync(file, html, 'utf8');
    logExtractor('debug-guardado', embedUrl, { file });
  } catch (err) {
    console.warn('[extraerVideoDirecto] debug-guardado-error', {
      embedUrl,
      message: err.message
    });
  }
}

function buildChromeHeaders(embedUrl, referer) {
  const ref = referer || embedUrl;
  let origin = ref;
  try {
    origin = new URL(ref).origin;
  } catch (_) {
    /* ignorar */
  }
  return {
    'User-Agent': UA,
    Referer: ref,
    Origin: origin,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'iframe',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Upgrade-Insecure-Requests': '1'
  };
}

async function fetchEmbedHtml(embedUrl, referer, timeout) {
  const useChrome = CHROME_EMBED_HOSTS.test(embedUrl);

  if (useChrome) {
    try {
      const { data, status } = await axios.get(embedUrl, {
        headers: buildChromeHeaders(embedUrl, referer),
        timeout,
        responseType: 'text',
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
      });
      if (data && String(data).length > 50) {
        logExtractor('fetch-chrome', embedUrl, { status, bytes: data.length });
        return String(data);
      }
    } catch (err) {
      logExtractor('fetch-chrome-fallo', embedUrl, {
        status: err.response?.status,
        message: err.message
      });
    }
  }

  const html = await fetchHtml(embedUrl, { referer, timeout });
  return html ? String(html) : '';
}

function resolveRedirectUrl(raw, baseUrl) {
  const u = normalizeMediaUrl(raw) || raw.trim();
  if (/^https?:\/\//i.test(u)) return u;
  try {
    return new URL(u, baseUrl).href;
  } catch {
    return null;
  }
}

function detectJsRedirect(html) {
  if (!html) return null;
  const patterns = [
    /(?:window\.location|top\.location|parent\.location)\s*=\s*["']([^"']+)["']/i,
    /location\.href\s*=\s*["']([^"']+)["']/i,
    /location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
    /window\.location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1] && !/^javascript:/i.test(m[1])) return m[1];
  }
  return null;
}

async function fetchWithRedirects(embedUrl, referer, timeout) {
  let currentUrl = embedUrl;
  let html = '';

  for (let i = 0; i <= MAX_JS_REDIRECTS; i++) {
    html = await fetchEmbedHtml(currentUrl, referer, timeout);
    if (!html) {
      return { html: '', finalUrl: currentUrl, redirectCount: i };
    }

    const redirect = detectJsRedirect(html);
    if (!redirect) break;

    const next = resolveRedirectUrl(redirect, currentUrl);
    if (!next || next === currentUrl) break;

    logExtractor('js-redirect', embedUrl, { from: currentUrl, to: next });
    currentUrl = next;
  }

  return { html, finalUrl: currentUrl, redirectCount: 0 };
}

// ─── Packer / Streamtape ────────────────────────────────────────────────────

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

// ─── Búsqueda de URLs en texto ────────────────────────────────────────────

function buscarUrlVideo(texto) {
  if (!texto) return null;

  const candidates = [];

  const push = (raw) => {
    const u = normalizeMediaUrl(raw);
    if (u && isMediaUrl(u)) candidates.push(u);
  };

  let m;
  const m3u8Re = /(https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)/gi;
  while ((m = m3u8Re.exec(texto)) !== null) push(m[1]);

  const mp4Re = /(https?:\/\/[^"'\s\\<>]+\.mp4[^"'\s\\<>]*)/gi;
  while ((m = mp4Re.exec(texto)) !== null) push(m[1]);

  const propPatterns = [
    /["']?file["']?\s*:\s*["']([^"']+)["']/gi,
    /["']?source["']?\s*:\s*["']([^"']+)["']/gi,
    /["']?hls["']?\s*:\s*["']([^"']+)["']/gi,
    /["']?hls_source["']?\s*:\s*["']([^"']+)["']/gi,
    /["']?hlsUrl["']?\s*:\s*["']([^"']+)["']/gi,
    /["']?src["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
    /["']?url["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi
  ];

  for (const re of propPatterns) {
    while ((m = re.exec(texto)) !== null) push(m[1]);
  }

  // acek-cdn sin extensión explícita en path
  const acekRe = /(https?:\/\/[^"'\s\\<>]*acek-cdn\.com[^"'\s\\<>]*)/gi;
  while ((m = acekRe.exec(texto)) !== null) push(m[1]);

  if (!candidates.length) return null;
  return candidates.find((u) => /\.m3u8/i.test(u)) || candidates[0];
}

function extraerSourcesArray(html) {
  const blocks = html.match(/sources\s*:\s*\[([\s\S]*?)\]/gi) || [];
  for (const block of blocks) {
    const found = buscarUrlVideo(block);
    if (found) return found;
  }
  return null;
}

function extraerPlaylist(html) {
  const blocks = html.match(/playlist\s*:\s*\[([\s\S]*?)\]/gi) || [];
  for (const block of blocks) {
    const found = buscarUrlVideo(block);
    if (found) return found;
  }
  return null;
}

function extraerJwplayer(html) {
  const setups = html.matchAll(/jwplayer\s*\([^)]*\)\.setup\s*\(\s*(\{[\s\S]*?\})\s*\)/gi);
  for (const m of setups) {
    const found = buscarUrlVideo(m[1]);
    if (found) return found;
  }
  const inline = html.matchAll(/\.setup\s*\(\s*(\{[\s\S]*?sources[\s\S]*?\})\s*\)/gi);
  for (const m of inline) {
    const found = buscarUrlVideo(m[1]);
    if (found) return found;
  }
  return null;
}

function extraerWindowVars(html) {
  const patterns = [
    /window\.video\s*=\s*["']([^"']+)["']/i,
    /window\.file\s*=\s*["']([^"']+)["']/i,
    /window\.hls\s*=\s*["']([^"']+)["']/i,
    /var\s+video\s*=\s*["']([^"']+)["']/i,
    /var\s+file\s*=\s*["']([^"']+)["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const found = normalizeMediaUrl(m[1]);
      if (found && isMediaUrl(found)) return found;
    }
  }

  const srcBlocks = html.match(/window\.sources\s*=\s*(\[[\s\S]*?\]);/i);
  if (srcBlocks?.[1]) {
    const found = buscarUrlVideo(srcBlocks[1]);
    if (found) return found;
  }

  return null;
}

function extraerAtob(html) {
  const re = /atob\s*\(\s*['"]([A-Za-z0-9+/=]{20,})['"]\s*\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      const found = buscarUrlVideo(decoded);
      if (found) return found;
    } catch (_) {
      /* siguiente */
    }
  }
  return null;
}

function extraerJsonParse(html) {
  const re = /JSON\.parse\s*\(\s*['"]((?:\\.|[^'"])*)['"]\s*\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, '/');
      const found = buscarUrlVideo(raw);
      if (found) return found;
      const parsed = JSON.parse(raw);
      const fromObj = buscarUrlVideo(JSON.stringify(parsed));
      if (fromObj) return fromObj;
    } catch (_) {
      /* siguiente */
    }
  }
  return null;
}

function extraerScriptsInline(html) {
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    const found = buscarUrlVideo(script);
    if (found) return found;
  }
  return null;
}

function extraerBase64Embebido(html) {
  const re = /['"]([A-Za-z0-9+/]{80,}={0,2})['"]/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      if (!/https?:\/\//i.test(decoded)) continue;
      const found = buscarUrlVideo(decoded);
      if (found) return found;
    } catch (_) {
      /* siguiente */
    }
  }
  return null;
}

function isLoaderShell(html) {
  return (
    /loading-container|Page is loading|please wait/i.test(html) &&
    /<script[^>]+src=["'][^"']+\.js/i.test(html)
  );
}

async function fetchExternalScripts(embedUrl, html, referer, timeout) {
  const scripts = [];
  const re = /<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi;
  let m;
  const base = new URL(embedUrl);

  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (/cloudflareinsights|beacon\.min\.js|google|gstatic/i.test(src)) continue;
    try {
      const scriptUrl = src.startsWith('http') ? src : new URL(src, base.origin).href;
      const { data } = await axios.get(scriptUrl, {
        headers: buildChromeHeaders(embedUrl, referer),
        timeout,
        responseType: 'text',
        validateStatus: (s) => s >= 200 && s < 400
      });
      if (data) {
        logExtractor('script-externo', embedUrl, {
          scriptUrl,
          bytes: String(data).length
        });
        scripts.push(String(data));
      }
    } catch (err) {
      logExtractor('script-externo-fallo', embedUrl, {
        src,
        message: err.message
      });
    }
  }

  return scripts.join('\n');
}

// ─── Pipeline de estrategias ────────────────────────────────────────────────

function runStrategies(ctx) {
  const { html, embedUrl, extraText = '' } = ctx;
  const combined = `${html}\n${extraText}`;
  const tried = [];

  const strategies = [
    {
      name: 'streamtape',
      run: () => {
        if (!/streamtape|strtape|stape|tapecontent/i.test(embedUrl) && !/robotlink/.test(html)) {
          return { skip: true, reason: 'no-streamtape' };
        }
        return extraerStreamtape(html);
      }
    },
    { name: 'html-regex', run: () => buscarUrlVideo(combined) },
    { name: 'inline-scripts-m3u8', run: () => extraerScriptsInline(combined) },
    { name: 'jwplayer-setup', run: () => extraerJwplayer(combined) },
    { name: 'sources-array', run: () => extraerSourcesArray(combined) },
    { name: 'playlist-array', run: () => extraerPlaylist(combined) },
    { name: 'window-video-sources', run: () => extraerWindowVars(combined) },
    { name: 'file-source-hls-props', run: () => buscarUrlVideo(combined) },
    { name: 'atob-base64', run: () => extraerAtob(combined) },
    { name: 'json-parse', run: () => extraerJsonParse(combined) },
    { name: 'base64-embebido', run: () => extraerBase64Embebido(combined) },
    {
      name: 'packed-js',
      run: () => {
        const unpacked = desempaquetarPacker(combined);
        if (!unpacked || unpacked === combined) return null;
        return buscarUrlVideo(unpacked);
      }
    }
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy.run();
      tried.push(strategy.name);

      if (result && typeof result === 'object' && result.skip) {
        logExtractor(`estrategia-skip:${strategy.name}`, embedUrl, {
          reason: result.reason
        });
        continue;
      }

      const url = normalizeMediaUrl(result);
      if (url && isMediaUrl(url)) {
        logExtractor(`estrategia-ok:${strategy.name}`, embedUrl, {
          urlFinal: url.slice(0, 120)
        });
        return { url, strategy: strategy.name, tried };
      }
    } catch (err) {
      logExtractor(`estrategia-error:${strategy.name}`, embedUrl, {
        message: err.message
      });
    }
  }

  return { url: null, tried };
}

// ─── API principal ──────────────────────────────────────────────────────────

async function extraerVideoDirecto(embedUrl, options = {}) {
  const referer = options.referer || embedUrl;
  const timeout = options.timeout || config.httpTimeoutMs || 15000;

  logExtractor('inicio', embedUrl, { referer, timeout });

  if (isStreamUrl(embedUrl) && !isEmbedPageUrl(embedUrl)) {
    logExtractor('ya-es-stream', embedUrl, { urlFinal: embedUrl });
    return embedUrl;
  }

  let html = '';
  try {
    const fetched = await fetchWithRedirects(embedUrl, referer, timeout);
    html = fetched.html;

    if (!html || html.length < 20) {
      logMotivoFallo(embedUrl, 'no-html', { bytes: html?.length || 0 });
      return null;
    }

    if (!/<script|m3u8|\.mp4|sources|jwplayer|file:|hls:/i.test(html)) {
      logMotivoFallo(embedUrl, 'no-scripts', {
        preview: html.slice(0, 200)
      });
    }

    let extraText = '';
    if (isLoaderShell(html)) {
      logExtractor('loader-shell-detectado', embedUrl);
      extraText = await fetchExternalScripts(embedUrl, html, referer, timeout);
    }

    const { url, strategy, tried } = runStrategies({ html, embedUrl, extraText });

    if (url) {
      logExtractor('exito', embedUrl, { urlFinal: url.slice(0, 120), strategy });
      return url;
    }

    const hasPacker = /eval\s*\(\s*function\s*\(p,a,c,k,e,d/.test(html);
    const hasJw = /jwplayer/i.test(html);

    let motivo = 'no-stream-found';
    if (!hasPacker && !hasJw && !buscarUrlVideo(html)) {
      motivo = 'no-packed-js';
    } else if (hasJw && !tried.includes('jwplayer-setup')) {
      motivo = 'no-jwplayer';
    }

    console.log('[extraerVideoDirecto] html-preview', {
      embedUrl,
      preview: html.slice(0, 3000)
    });

    logMotivoFallo(embedUrl, motivo, {
      estrategias: tried,
      hasPacker,
      hasJw,
      htmlBytes: html.length,
      extraScriptBytes: extraText.length
    });

    saveDebugHtml(
      embedUrl,
      extraText
        ? `<!-- SCRIPTS EXTERNOS -->\n${extraText}\n\n<!-- HTML PAGINA -->\n${html}`
        : html
    );
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
    logMotivoFallo(embedUrl, 'fetch-error', { message: error.message });

    if (html && html.length > 100) {
      console.log('[extraerVideoDirecto] html-preview', {
        embedUrl,
        preview: html.slice(0, 3000)
      });
      saveDebugHtml(embedUrl, html);
    }

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
  buildChromeHeaders,
  UA
};
