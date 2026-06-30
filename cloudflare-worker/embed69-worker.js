/**
 * Relay HTTP para embed69 y hosts de video (PelisplusHD en Render).
 *
 * Uso:
 *   GET https://TU-WORKER.workers.dev/?url=https://embed69.org/f/tt1390535/
 *   GET ...?url=...&referer=https://pelisplushd.bz/
 *
 * En Render:
 *   EMBED69_RELAY_URL=https://TU-WORKER-EMBED69.workers.dev
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Solo estos hosts pueden ser proxied (evita abuso como proxy abierto). */
const ALLOWED_HOSTS = new Set([
  'embed69.org',
  'pelisplushd.bz',
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
]);

function isAllowedHost(hostname) {
  if (ALLOWED_HOSTS.has(hostname)) return true;
  for (const h of ALLOWED_HOSTS) {
    if (hostname.endsWith('.' + h)) return true;
  }
  return false;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Key'
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
    }

    const relayKey = env?.RELAY_KEY;
    if (relayKey) {
      const key = request.headers.get('X-Relay-Key');
      if (key !== relayKey) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
      }
    }

    const reqUrl = new URL(request.url);
    const targetUrl = reqUrl.searchParams.get('url');
    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400, headers: corsHeaders() });
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new Response('Invalid url', { status: 400, headers: corsHeaders() });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return new Response('Invalid protocol', { status: 400, headers: corsHeaders() });
    }

    if (!isAllowedHost(parsed.hostname)) {
      return new Response(`Host not allowed: ${parsed.hostname}`, {
        status: 403,
        headers: corsHeaders()
      });
    }

    const referer =
      reqUrl.searchParams.get('referer') ||
      `${parsed.protocol}//${parsed.hostname}/`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: referer,
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      },
      redirect: 'follow'
    });

    const contentType = response.headers.get('Content-Type') || 'text/html; charset=utf-8';

    return new Response(response.body, {
      status: response.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      }
    });
  }
};
