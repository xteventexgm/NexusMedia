const axios = require('axios');
const https = require('https');
const config = require('../config/env');

const DEFAULT_URL = 'https://doraflix.fluxcedene.net/api/gql';

/** La API rechaza Origin/Referer de doramasflix.co con 401. Solo headers mínimos. */
const GQL_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json'
};

const httpsAgent = new https.Agent({
  keepAlive: true,
  family: 4
});

function resolveProxy() {
  const raw = process.env.DORAMASFLIX_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return {
      protocol: u.protocol,
      host: u.hostname,
      port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80),
      auth: u.username ? `${u.username}:${u.password}` : undefined
    };
  } catch {
    console.warn('[DoramasFlix] Proxy inválido:', raw);
    return undefined;
  }
}

function createClient(extraHeaders = {}) {
  const proxy = resolveProxy();
  return axios.create({
    timeout: config.doramasFlixTimeoutMs,
    headers: { ...GQL_HEADERS, ...extraHeaders },
    httpsAgent,
    proxy: proxy || false,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 300
  });
}

function apiUrl() {
  return config.doramasFlixApiUrl || DEFAULT_URL;
}

function formatError(err) {
  const status = err.response?.status;
  const body = err.response?.data;
  const apiMsg = body?.message || body?.errors?.[0]?.message;
  return [status ? `HTTP ${status}` : null, apiMsg, err.message].filter(Boolean).join(' — ');
}

function validateGqlResponse(data) {
  if (data?.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join('; '));
  }
  if (data?.success === false) {
    throw new Error(data.message || 'Respuesta rechazada por la API');
  }
  return data;
}

async function postWithRetries(client, url, body, operationName) {
  let lastError;

  for (let attempt = 1; attempt <= config.doramasFlixRetries; attempt++) {
    try {
      const { data } = await client.post(url, body);
      return validateGqlResponse(data);
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const retryable = !status || status === 429 || status >= 500;

      // Diagnóstico claro del motivo
      if (status === 401 || status === 403) {
        console.error(
          `[DoramasFlix] ${operationName} → ${status} (IP probablemente bloqueada). ` +
          'Configura DORAMASFLIX_RELAY_URL o un proxy residencial.'
        );
      } else {
        console.warn(
          `[DoramasFlix] ${operationName} intento ${attempt}/${config.doramasFlixRetries}: ${formatError(err)}`
        );
      }

      if (attempt < config.doramasFlixRetries && retryable) {
        await new Promise((r) => setTimeout(r, attempt * 700));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

/** Petición directa a la API de DoramasFlix (IP local / no bloqueada). */
async function directGqlRequest(body, operationName = 'gql') {
  const client = createClient();
  return postWithRetries(client, apiUrl(), body, operationName);
}

/** Petición vía relay en tu red local (Render → tu PC/Docker). */
async function relayGqlRequest(body, operationName = 'gql') {
  const client = createClient({
    'X-Relay-Key': config.doramasFlixRelayKey
  });
  return postWithRetries(client, config.doramasFlixRelayUrl, body, `${operationName}@relay`);
}

/**
 * Usa relay si está configurado; si no, petición directa.
 * En Render la IP de datacenter suele estar bloqueada → configurar relay.
 * Si el relay falla, hace fallback a petición directa como último recurso.
 */
async function gqlRequest(body, operationName = 'gql') {
  if (config.doramasFlixRelayUrl) {
    try {
      return await relayGqlRequest(body, operationName);
    } catch (relayErr) {
      const status = relayErr.response?.status;
      // Si el relay devuelve 401 (clave incorrecta) o error de red, intentar directo
      console.warn(
        `[DoramasFlix] Relay falló (${formatError(relayErr)}). Intentando petición directa como fallback...`
      );
      try {
        return await directGqlRequest(body, `${operationName}@fallback-directo`);
      } catch (directErr) {
        const directStatus = directErr.response?.status;
        if (directStatus === 401 || directStatus === 403) {
          console.error(
            '[DoramasFlix] ❌ Tanto relay como directo fallaron. ' +
            'El relay no responde y la IP directa está bloqueada. ' +
            'Verifica: 1) que DORAMASFLIX_RELAY_URL es accesible, ' +
            '2) que DORAMASFLIX_RELAY_KEY coincide en ambos lados, ' +
            '3) que Docker local con DORAMAS_RELAY_ENABLED=true está corriendo.'
          );
        }
        // Lanzar el error original del relay (es más relevante)
        throw relayErr;
      }
    }
  }
  return directGqlRequest(body, operationName);
}

module.exports = {
  gqlRequest,
  directGqlRequest,
  apiUrl,
  GQL_HEADERS
};
