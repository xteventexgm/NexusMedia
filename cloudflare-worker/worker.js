/**
 * Relay GraphQL DoramasFlix — Render → Cloudflare → sv1.fluxcedene.net
 *
 * En Render:
 *   DORAMASFLIX_RELAY_URL=https://TU-WORKER.workers.dev
 *   (sin DORAMASFLIX_RELAY_KEY si no usas autenticación)
 */

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await request.text();

    const response = await fetch('https://sv1.fluxcedene.net/api/gql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body
    });

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
