const axios = require('axios');
const config = require('../config/env');
const { UA } = require('./userAgent');

const RELAY_HOSTS = [
  'embed69.org',
  'minochinos.com',
  'vidhidepro.com',
  'mivalyo.com',
  'dinisglows.com',
  'dhtpre.com',
  'streamwish.to',
  'hglink.to',
  'filemoon.sx',
  'filemoon.link',
  'bysedikamoum.com',
  'voe.sx',
  'streamtape.com',
  'streamtape.to',
  'strtape.cloud',
  'watchsb.com',
  'sblona.com'
];

function hostNeedsRelay(url) {
  try {
    const host = new URL(url).hostname;
    return RELAY_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function shouldPreferRelay() {
  return (
    !!config.embed69RelayUrl &&
    (process.env.EMBED69_RELAY_ONLY === 'true' ||
      (!!process.env.RENDER && !!config.embed69RelayUrl))
  );
}

function buildRelayRequestUrl(targetUrl, referer) {
  const relay = new URL(config.embed69RelayUrl);
  relay.searchParams.set('url', targetUrl);
  if (referer) relay.searchParams.set('referer', referer);
  return relay.toString();
}

function relayHeaders() {
  const headers = { Accept: 'text/html,*/*' };
  if (config.embed69RelayKey) {
    headers['X-Relay-Key'] = config.embed69RelayKey;
  }
  return headers;
}

async function fetchViaRelay(targetUrl, { referer, timeout } = {}) {
  const relayUrl = buildRelayRequestUrl(targetUrl, referer);
  const { data, status } = await axios.get(relayUrl, {
    timeout: timeout || config.httpTimeoutMs,
    headers: relayHeaders(),
    responseType: 'text',
    validateStatus: () => true
  });

  if (status >= 400) {
    const err = new Error(`Relay HTTP ${status} para ${targetUrl}`);
    err.status = status;
    throw err;
  }

  return data;
}

/**
 * GET HTML con fallback relay si embed69/hosts bloquean la IP del servidor (403).
 */
async function fetchHtml(targetUrl, { referer, timeout } = {}) {
  const directOpts = {
    timeout: timeout || config.httpTimeoutMs,
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
      ...(referer ? { Referer: referer } : {})
    },
    responseType: 'text'
  };

  const preferRelay = shouldPreferRelay() && hostNeedsRelay(targetUrl);

  if (preferRelay) {
    try {
      console.log('[embed69] relay →', targetUrl);
      return await fetchViaRelay(targetUrl, { referer, timeout });
    } catch (relayErr) {
      if (process.env.EMBED69_RELAY_ONLY === 'true') throw relayErr;
      console.warn(`[embed69] relay falló (${relayErr.message}), intento directo`);
    }
  }

  try {
    const { data } = await axios.get(targetUrl, directOpts);
    return data;
  } catch (err) {
    const status = err.response?.status;
    if (config.embed69RelayUrl && hostNeedsRelay(targetUrl) && (status === 403 || status === 401)) {
      console.warn(`[embed69] ${status} directo → relay:`, targetUrl);
      return fetchViaRelay(targetUrl, { referer, timeout });
    }
    throw err;
  }
}

module.exports = {
  fetchHtml,
  fetchViaRelay,
  hostNeedsRelay
};
