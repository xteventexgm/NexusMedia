/**
 * URL base del API de contenido.
 * Prioridad: localStorage (configurable en runtime) > variable de entorno Vite.
 */
export function getDefaultApiUrl() {
  var env = import.meta.env.VITE_API_URL
  var prodFallback = 'https://nexusmedia-1mpl.onrender.com'
  var devFallback = 'http://localhost:3000'
  var base = env || (import.meta.env.PROD ? prodFallback : devFallback)
  base = base.trim().replace(/\/$/, '')
  if (!/\/api$/i.test(base)) base = base + '/api'
  return base
}

export function getApiUrl() {
  try {
    var stored = localStorage.getItem('api_url')
    if (stored) return stored
  } catch (e) {
    /* localStorage no disponible (emulador / modo privado) */
  }
  return getDefaultApiUrl()
}

export function setApiUrl(url) {
  if (url) {
    var limpia = url.trim().replace(/\/$/, '')
    if (!/^https?:\/\//i.test(limpia)) limpia = 'http://' + limpia
    localStorage.setItem('api_url', limpia)
  } else {
    localStorage.removeItem('api_url')
  }
}

export function resetApiUrl() {
  localStorage.removeItem('api_url')
}

export function normalizeApiInput(input) {
  if (!input) return ''
  var limpia = input.trim().replace(/\/$/, '')
  if (!limpia) return ''
  if (!/^https?:\/\//i.test(limpia)) limpia = 'http://' + limpia
  if (!/\/api$/i.test(limpia)) limpia = limpia + '/api'
  return limpia
}
