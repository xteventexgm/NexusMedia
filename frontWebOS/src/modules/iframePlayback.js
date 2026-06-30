import { isWebOS } from '../utils/platform.js'

/**
 * Reproducción embebida vía iframe — deshabilitada por defecto en WebOS.
 * Activar manualmente con localStorage.setItem('nexus_iframe_playback', '1')
 */
export function isIframePlaybackEnabled() {
  if (isWebOS()) {
    // En TV: iframe activo por defecto para streamwish/voe; desactivar con localStorage '0'
    return localStorage.getItem('nexus_iframe_playback') !== '0'
  }
  return localStorage.getItem('nexus_iframe_playback') !== '0'
}

/** @deprecated Usar isIframePlaybackEnabled() */
export var IFRAME_PLAYBACK_ENABLED = isIframePlaybackEnabled()

/**
 * @param {string} url
 * @param {{ iframe: HTMLIFrameElement, topBar: HTMLElement, mensaje: HTMLElement }} ctx
 */
export function playViaIframe(url, ctx) {
  if (!isIframePlaybackEnabled()) {
    if (ctx.mensaje) {
      ctx.mensaje.textContent = 'Este contenido no es compatible con televisores LG.'
      ctx.mensaje.classList.remove('hidden')
    }
    return false
  }

  ctx.iframe.classList.remove('hidden')
  ctx.iframe.src = url
  if (ctx.topBar) ctx.topBar.classList.remove('opacity-0', 'pointer-events-none')
  if (ctx.mensaje) {
    ctx.mensaje.textContent = 'Reproducción embebida — algunos servidores no funcionan en WebOS.'
    ctx.mensaje.classList.remove('hidden')
  }
  return true
}

export function stopIframe(ctx) {
  if (ctx.iframe) {
    ctx.iframe.src = 'about:blank'
    ctx.iframe.classList.add('hidden')
  }
}

export function isIframeActive(iframeEl) {
  return iframeEl && !iframeEl.classList.contains('hidden')
}
