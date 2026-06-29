import { formatTime } from '../utils/formatTime.js'

export { formatTime }

export const Player = {
  procesarReproduccion: null,
  mostrarControles: null,
  ocultarControles: null,
  controlesVisibles: null,
  cerrarOverlayEpisodios: null,
  overlayEpisodiosVisible: null
}

var getCtxFactory = null
var initPromise = null

export function setPlayerContextFactory(fn) {
  getCtxFactory = fn
}

/** Carga player.js + hls.js solo cuando hace falta reproducir. */
export function ensurePlayerModule() {
  if (Player.procesarReproduccion) return Promise.resolve()
  if (!initPromise) {
    initPromise = import('./player.js').then(function (mod) {
      mod.initPlayerModule(function () {
        return getCtxFactory ? getCtxFactory() : {}
      })
      Object.assign(Player, mod.Player)
    })
  }
  return initPromise
}

export async function iniciarReproduccion(urlEpisodio, tituloPantalla, indexActual) {
  await ensurePlayerModule()
  if (Player.procesarReproduccion) {
    return Player.procesarReproduccion(urlEpisodio, tituloPantalla, indexActual)
  }
}
