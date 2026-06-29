const PLACEHOLDER_POSTER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='300'><rect width='100%' height='100%' fill='#2a2a2a'/><text x='50%' y='52%' font-size='14' text-anchor='middle' fill='#666'>Sin póster</text></svg>"
  )

/**
 * Asigna poster con fallback y libera memoria si falla la carga.
 */
export function bindPosterImage(img, src) {
  if (!img) return
  img.decoding = 'async'
  img.loading = 'lazy'
  if (!src) {
    img.src = PLACEHOLDER_POSTER
    return
  }
  img.onerror = function () {
    img.onerror = null
    img.src = PLACEHOLDER_POSTER
  }
  img.src = src
}

export function clearPosterImage(img) {
  if (!img) return
  img.onerror = null
  img.removeAttribute('src')
}

export { PLACEHOLDER_POSTER }
