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

function createClient() {
  const proxy = resolveProxy();
  return axios.create({
    timeout: config.doramasFlixTimeoutMs,
    headers: { ...GQL_HEADERS },
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

/**
 * Petición GraphQL con reintentos en errores de red / 429 / 5xx.
 */
async function gqlRequest(body, operationName = 'gql') {
  const client = createClient();
  const url = apiUrl();
  let lastError;

  for (let attempt = 1; attempt <= config.doramasFlixRetries; attempt++) {
    try {
      const { data } = await client.post(url, body);
      if (data?.errors?.length) {
        throw new Error(data.errors.map((e) => e.message).join('; '));
      }
      if (data?.success === false) {
        throw new Error(data.message || 'Respuesta rechazada por la API');
      }
      return data;
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const retryable = !status || status === 429 || status >= 500;
      console.warn(
        `[DoramasFlix] ${operationName} intento ${attempt}/${config.doramasFlixRetries}: ${formatError(err)}`
      );
      if (attempt < config.doramasFlixRetries && retryable) {
        await new Promise((r) => setTimeout(r, attempt * 700));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

module.exports = { gqlRequest, apiUrl, GQL_HEADERS };
