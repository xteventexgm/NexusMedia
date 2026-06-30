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

/** Cierra la app webOS (mando Atrás en pantalla raíz). */
export function cerrarAppWebOS() {
  try {
    if (window.webOS?.platformBack) {
      window.webOS.platformBack()
      return
    }
  } catch (_) {
    /* ignore */
  }
  try {
    window.close()
  } catch (_) {
    /* ignore */
  }
}

/**
 * Enfoca un input y fuerza el teclado virtual en webOS TV.
 * El truco readonly evita texto invertido / cursor al inicio en algunos firmwares.
 */
export function activarTecladoVirtual(input) {
  if (!input) return
  input.focus()
  ponerCursorAlFinal(input)
  if (!isWebOS()) return
  input.readOnly = true
  requestAnimationFrame(function () {
    input.readOnly = false
    input.focus()
    ponerCursorAlFinal(input)
  })
}

export function ponerCursorAlFinal(input) {
  if (!input) return
  const len = (input.value || '').length
  try {
    input.setSelectionRange(len, len)
  } catch (_) {
    /* ignore */
  }
}
