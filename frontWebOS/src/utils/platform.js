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

/**
 * Ajusta viewport y clases para pantalla completa en TV física.
 * FHD: 1280×720 · UHD: 1920×1080 (el emulador suele reportar más que la TV real).
 */
export function aplicarViewportTV() {
  if (!isWebOS()) return { w: 0, h: 0 }

  document.documentElement.classList.add('webos-tv-root')
  if (document.body) document.body.classList.add('webos-tv')

  var w = window.innerWidth || 0
  var h = window.innerHeight || 0
  if (w < 640) {
    w = 1280
    h = 720
  }

  var meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.appendChild(meta)
  }
  meta.setAttribute(
    'content',
    'width=' + w + ', height=' + h + ', initial-scale=1, user-scalable=no'
  )
  return { w: w, h: h }
}

/** scrollTo({top,behavior}) no existe en Chrome 38 (webOS antiguo). */
export function scrollToTop(el) {
  if (!el) return
  el.scrollTop = 0
}

export function scrollToLeft(el, left) {
  if (!el) return
  el.scrollLeft = left
}

export function scrollByHorizontal(el, delta) {
  if (!el) return
  el.scrollLeft = el.scrollLeft + delta
}

/** Aplana una matriz de filas (sustituto de Array.flat en Chrome 38). */
export function flattenRows(rows) {
  var out = []
  if (!rows) return out
  for (var i = 0; i < rows.length; i++) {
    var fila = rows[i]
    if (!fila) continue
    for (var j = 0; j < fila.length; j++) out.push(fila[j])
  }
  return out
}

/** focus({ preventScroll }) no existe en Chrome 38. */
export function focusTV(el) {
  if (!el || typeof el.focus !== 'function') return
  try {
    el.focus()
  } catch (_) {
    /* ignore */
  }
}

/** scrollIntoView(options) con objeto no existe en Chrome 38. */
export function scrollIntoViewTV(el, nearest) {
  if (!el || typeof el.scrollIntoView !== 'function') return
  try {
    el.scrollIntoView(nearest === false)
  } catch (_) {
    try {
      el.scrollIntoView()
    } catch (__) {
      /* ignore */
    }
  }
}

/** HTMLSelectElement.showPicker — Chrome 99+ */
export function abrirSelectNativo(select) {
  if (!select) return
  if (typeof select.showPicker === 'function') {
    try {
      select.showPicker()
      return
    } catch (_) {
      /* fallback */
    }
  }
  focusTV(select)
}

/**
 * Chrome 38 no entiende `inset:0` (Tailwind .inset-0). Sin top/left/right/bottom
 * un position:fixed queda sin tamaño y el modal no se ve en la TV.
 */
export function aplicarOverlayTV(el, zIndex) {
  if (!el) return
  el.style.position = 'fixed'
  el.style.top = '0'
  el.style.left = '0'
  el.style.right = '0'
  el.style.bottom = '0'
  el.style.width = '100%'
  el.style.height = '100%'
  if (zIndex != null) el.style.zIndex = String(zIndex)
}

export function quitarOverlayTV(el) {
  if (!el) return
  el.style.position = ''
  el.style.top = ''
  el.style.left = ''
  el.style.right = ''
  el.style.bottom = ''
  el.style.width = ''
  el.style.height = ''
  el.style.zIndex = ''
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
