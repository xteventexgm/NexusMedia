const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const port = parseInt(process.env.PORT || process.env.NEXUS_API_PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

const dataDir =
  process.env.NEXUS_DATA_DIR ||
  process.env.NEXUS_USER_DATA ||
  path.join(__dirname, '..', '..');

module.exports = {
  nodeEnv,
  port,
  host,
  isProduction: nodeEnv === 'production',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  tmdbApiKey: process.env.TMDB_API_KEY || '',
  tmdbReadToken: process.env.TMDB_READ_TOKEN || process.env.TMDB_TOKEN || '',
  dataDir,
  httpTimeoutMs: parseInt(process.env.HTTP_TIMEOUT_MS || '20000', 10),
  homeCacheTtlMs: parseInt(process.env.HOME_CACHE_TTL_MS || String(5 * 60 * 1000), 10),
  tvCacheTtlMs: parseInt(process.env.TV_CACHE_TTL_MS || String(12 * 60 * 60 * 1000), 10),
  doramasFlixApiUrl: process.env.DORAMASFLIX_API_URL || 'https://sv1.fluxcedene.net/api/gql',
  doramasFlixTimeoutMs: parseInt(process.env.DORAMASFLIX_TIMEOUT_MS || process.env.HTTP_TIMEOUT_MS || '30000', 10),
  doramasFlixRetries: parseInt(process.env.DORAMASFLIX_RETRIES || '3', 10),
  doramasFlixRelayUrl: process.env.DORAMASFLIX_RELAY_URL || '',
  doramasFlixRelayKey: process.env.DORAMASFLIX_RELAY_KEY || process.env.DORAMAS_RELAY_KEY || '',
  embed69RelayUrl: process.env.EMBED69_RELAY_URL || '',
  embed69RelayKey: process.env.EMBED69_RELAY_KEY || '',
  nexusPublicUrl: (
    process.env.NEXUS_PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    ''
  ).replace(/\/$/, '')
};
