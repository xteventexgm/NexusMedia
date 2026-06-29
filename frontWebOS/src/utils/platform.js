/**
 * Detección de plataforma LG WebOS (TV y simulador).
 */
export function isWebOS() {
  if (typeof window === 'undefined') return false
  if (window.webOS) return true
  const ua = navigator.userAgent || ''
  return /Web0S|WebOS/i.test(ua)
}

export function isWebOSTV() {
  return isWebOS() && !/Mobile/i.test(navigator.userAgent || '')
}
