const axios = require('axios');
const crypto = require('crypto');
const { buscarUrlVideo } = require('./extractor');

const P2P_KEY = 'kiemtienmua911ca';
const P2P_IVS = ['1234567890oiuytr', '0123456789abcdef'];

const HLS_FIELD_ORDER = [
  'hlsVideoTiktok',
  'hlsVideoGoogle',
  'hlsVideoCloudflare',
  'hlsVideoInHouse',
  'hlsVideo',
  'hls',
  'source'
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
  ]);
}

function resolveP2pUrl(base, path) {
  if (!path) return null;
  const clean = String(path).replace(/\\\//g, '/');
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('//')) return `https:${clean}`;
  const origin = base.replace(/\/$/, '');
  return `${origin}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

function extractHlsUrls(decryptedText, base) {
  const text = String(decryptedText);
  const found = [];
  const seen = new Set();

  const push = (raw) => {
    const url = resolveP2pUrl(base, raw);
    if (!url || seen.has(url)) return;
    if (!/\.m3u8/i.test(url) && !url.includes('/hls/')) return;
    seen.add(url);
    found.push(url);
  };

  try {
    const parsed = JSON.parse(text);
    for (const key of HLS_FIELD_ORDER) {
      if (parsed[key]) push(parsed[key]);
    }
    for (const [key, val] of Object.entries(parsed)) {
      if (/^hls/i.test(key) && typeof val === 'string') push(val);
    }
  } catch (_) {
    /* JSON parcial o con bytes corruptos — regex abajo */
  }

  for (const key of HLS_FIELD_ORDER) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const m = text.match(re);
    if (m) push(m[1]);
  }

  for (const m of text.matchAll(/"hls[A-Za-z]*"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    push(m[1]);
  }

  const rel = text.match(/(\/hls\/[^\s"']+\.m3u8[^\s"']*)/i);
  if (rel) push(rel[1]);

  const direct = buscarUrlVideo(text);
  if (direct) push(direct);

  return found;
}

/**
 * Extrae URLs HLS desde un embed p2pplay.online (#hash).
 */
async function extraerHlsP2pPlay(embedUrl, timeoutMs = 20000) {
  const hash = embedUrl.includes('#')
    ? embedUrl.substring(embedUrl.lastIndexOf('#') + 1)
    : embedUrl.substring(embedUrl.lastIndexOf('/') + 1);

  if (!hash) return [];

  let base;
  try {
    const u = new URL(embedUrl.split('#')[0]);
    base = `${u.protocol}//${u.host}`;
  } catch {
    base = 'https://doramasfoxito.p2pplay.online';
  }

  const { data: encoded } = await axios.get(`${base}/api/v1/video?id=${encodeURIComponent(hash)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
      Accept: '*/*'
    },
    timeout: timeoutMs,
    validateStatus: (s) => s >= 200 && s < 300
  });

  const hex = String(encoded).trim().replace(/^"|"$/g, '');
  const urls = [];

  for (const iv of P2P_IVS) {
    try {
      const decrypted = decryptP2pHex(hex, P2P_KEY, iv);
      const text = decrypted.toString('utf8');
      const batch = extractHlsUrls(text, base);
      for (const u of batch) {
        if (!urls.includes(u)) urls.push(u);
      }
      if (urls.length) break;
    } catch (_) {
      /* siguiente IV */
    }
  }

  return urls;
}

module.exports = {
  extraerHlsP2pPlay,
  extractHlsUrls,
  resolveP2pUrl
};
