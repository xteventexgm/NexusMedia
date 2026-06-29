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
  return extractHlsEntries(decryptedText, base).map((x) => x.url);
}

function extractHlsEntries(decryptedText, base) {
  const text = String(decryptedText);
  const ordered = [];
  const seen = new Set();

  const push = (raw, label) => {
    const url = resolveP2pUrl(base, raw);
    if (!url || seen.has(url)) return;
    if (!/\.m3u8/i.test(url) && !url.includes('/hls/')) return;
    seen.add(url);
    ordered.push({ url, label: label || 'HLS' });
  };

  let configOrder = [];
  const cfgMatch = text.match(/"streamingConfig"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (cfgMatch) {
    try {
      const cfg = JSON.parse(cfgMatch[1].replace(/\\\//g, '/'));
      if (Array.isArray(cfg.order)) configOrder = cfg.order;
    } catch (_) {}
  }

  const labelForKey = (key) => {
    const m = key.match(/hlsVideo(\w+)/i);
    return m ? m[1] : key;
  };

  const fieldMap = new Map();
  for (const m of text.matchAll(/"hls[A-Za-z]*"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    const keyMatch = m[0].match(/"(hls[A-Za-z]*)"/);
    const key = keyMatch ? keyMatch[1] : 'hls';
    fieldMap.set(key, m[1]);
  }

  try {
    const parsed = JSON.parse(text);
    for (const [key, val] of Object.entries(parsed)) {
      if (/^hls/i.test(key) && typeof val === 'string') fieldMap.set(key, val);
    }
  } catch (_) {}

  for (const provider of configOrder) {
    const key = `hlsVideo${provider}`;
    if (fieldMap.has(key)) push(fieldMap.get(key), provider);
  }

  for (const key of HLS_FIELD_ORDER) {
    if (fieldMap.has(key)) push(fieldMap.get(key), labelForKey(key));
  }

  for (const [key, val] of fieldMap) {
    push(val, labelForKey(key));
  }

  const rel = text.match(/(\/hls\/[^\s"']+\.m3u8[^\s"']*)/i);
  if (rel) push(rel[1], 'Direct');

  const direct = buscarUrlVideo(text);
  if (direct) push(direct, 'Direct');

  return ordered;
}

/**
 * Extrae URLs HLS desde un embed p2pplay.online (#hash).
 */
async function extraerHlsP2pPlay(embedUrl, timeoutMs = 20000) {
  const entries = await extraerHlsP2pPlayDetailed(embedUrl, timeoutMs);
  return entries.map((e) => e.url);
}

async function extraerHlsP2pPlayDetailed(embedUrl, timeoutMs = 20000) {
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
  const entries = [];

  for (const iv of P2P_IVS) {
    try {
      const decrypted = decryptP2pHex(hex, P2P_KEY, iv);
      const text = decrypted.toString('utf8');
      const batch = extractHlsEntries(text, base);
      for (const e of batch) {
        if (!entries.some((x) => x.url === e.url)) entries.push(e);
      }
      if (entries.length) break;
    } catch (_) {
      /* siguiente IV */
    }
  }

  return entries;
}

module.exports = {
  extraerHlsP2pPlay,
  extraerHlsP2pPlayDetailed,
  extractHlsUrls,
  resolveP2pUrl
};
