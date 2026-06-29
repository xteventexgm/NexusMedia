/**
 * URL base del API de contenido.
 * Prioridad: localStorage (configurable en runtime) > variable de entorno Vite.
 */
export function getDefaultApiUrl() {
  var env = import.meta.env.VITE_API_URL
  return env || 'http://localhost:3000/api'
}

export function getApiUrl() {
  var stored = localStorage.getItem('api_url')
  return stored || getDefaultApiUrl()
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
