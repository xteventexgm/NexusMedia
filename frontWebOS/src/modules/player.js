import { apiFetch } from '../services/apiClient.js'
import { libraryApi } from '../storage/library.js'
import { attachStream, destroyStreamHandle, prepareVideoForPlayback } from '../utils/hlsPlayback.js'
import { isStreamPlaybackUrl, isHlsServerName } from '../utils/streamDetect.js'
import {
  playViaIframe,
  stopIframe,
  isIframeActive,
  isIframePlaybackEnabled
} from './iframePlayback.js'
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

export function initPlayerModule(getCtx) {
  const modalReproductor = document.getElementById('modal-reproductor')
  const videoPlayer = document.getElementById('video-player')
  const iframePlayer = document.getElementById('iframe-player')
  const btnCerrarReproductor = document.getElementById('btn-cerrar-reproductor')
  const tituloReproductor = document.getElementById('titulo-reproductor')
  const mensajeReproductor = document.getElementById('mensaje-reproductor')
  const selectorServidor = document.getElementById('selector-servidor')
  const customControls = document.getElementById('custom-controls')
  const btnPlayPause = document.getElementById('btn-play-pause')
  const btnPrevEp = document.getElementById('btn-prev-ep')
  const btnNextEp = document.getElementById('btn-next-ep')
  const progressBar = document.getElementById('progress-bar')
  const timeDisplay = document.getElementById('time-display')
  const btnFullscreen = document.getElementById('btn-fullscreen')
  const btnEpLista = document.getElementById('btn-ep-lista')
  const playerEpOverlay = document.getElementById('player-ep-overlay')
  const playerEpLista = document.getElementById('player-ep-lista')
  const playerEpCerrar = document.getElementById('player-ep-cerrar')
  const playerEpTitulo = document.getElementById('player-ep-titulo')
  const topBarReproductor = document.getElementById('top-bar-reproductor')
  const iconPlay = document.getElementById('icon-play')
  const iconPause = document.getElementById('icon-pause')

  let lastSaveTime = 0
  let lastSavedProgress = -1
  let timeoutControles
  let playbackToken = 0

  function guardarProgresoEpisodioActual(opciones = {}) {
    const ctx = getCtx()
    const { forzarCompletado = false } = opciones
    if (!ctx.urlEpisodioJugando || !videoPlayer.duration) return Promise.resolve()

    const progresoActual = ctx.bibliotecaLocal.progreso[ctx.urlEpisodioJugando]
    const yaEstabaVisto = Boolean(progresoActual?.visto)
    let tiempo = videoPlayer.currentTime
    let estaVisto = yaEstabaVisto

    if (forzarCompletado) {
      tiempo = videoPlayer.duration
      estaVisto = true
    } else {
      const percent = (tiempo / videoPlayer.duration) * 100
      estaVisto = percent > 90 || yaEstabaVisto
    }

    if (tiempo < 1 && !estaVisto) return Promise.resolve()

    ctx.bibliotecaLocal.progreso[ctx.urlEpisodioJugando] = { tiempo, visto: estaVisto, duracion: videoPlayer.duration }
    lastSavedProgress = tiempo

    return libraryApi
      .saveProgress(
        ctx.objetoAnimeActual,
        ctx.urlEpisodioJugando,
        tiempo,
        estaVisto,
        videoPlayer.duration
      )
      .then((nuevoHistorial) => {
        ctx.bibliotecaLocal.historial = nuevoHistorial
      })
  }

  function cambiarEpisodio(indiceDestino) {
    const ctx = getCtx()
    const ep = ctx.episodiosDelAnimeActual[indiceDestino]
    if (!ep) return
    guardarProgresoEpisodioActual().then(() => {
      Player.procesarReproduccion(ep.url, tituloParaEpisodio(ep, indiceDestino), indiceDestino)
    })
  }

  function mostrarControlesReproductor(autoOcultar = true) {
    if (isIframeActive(iframePlayer)) return
    topBarReproductor.classList.remove('opacity-0', 'pointer-events-none')
    customControls.classList.remove('opacity-0', 'pointer-events-none')
    modalReproductor.style.cursor = 'default'
    clearTimeout(timeoutControles)
    if (autoOcultar && !videoPlayer.paused) {
      timeoutControles = setTimeout(ocultarControlesReproductor, 3000)
    }
  }

  function ocultarControlesReproductor() {
    if (isIframeActive(iframePlayer)) return
    if (videoPlayer.paused) return
    topBarReproductor.classList.add('opacity-0', 'pointer-events-none')
    customControls.classList.add('opacity-0', 'pointer-events-none')
    modalReproductor.style.cursor = 'none'
    window.dispatchEvent(new CustomEvent('nexus:player-controles-ocultos'))
  }

  function controlesEstanVisibles() {
    return !customControls.classList.contains('opacity-0')
  }

  function tituloParaEpisodio(ep, index) {
    const ctx = getCtx()
    if (ctx.tituloParaEpisodio) return ctx.tituloParaEpisodio(ep, index)
    return ep.nombre || `Episodio ${index + 1}`
  }

  function actualizarBotonCapitulos() {
    const ctx = getCtx()
    const esSerie =
      ctx.episodiosDelAnimeActual.length > 1 && !(ctx.esPelicula && ctx.esPelicula())
    btnEpLista.classList.toggle('hidden', !esSerie)
  }

  function cerrarOverlayEpisodios() {
    if (!playerEpOverlay) return
    playerEpOverlay.classList.remove('is-open')
    playerEpOverlay.setAttribute('aria-hidden', 'true')
    window.dispatchEvent(
      new CustomEvent('nexus:player-ep-overlay', { detail: { abierto: false } })
    )
  }

  function abrirOverlayEpisodios() {
    const ctx = getCtx()
    if (!playerEpOverlay || ctx.episodiosDelAnimeActual.length <= 1) return
    if (ctx.esPelicula && ctx.esPelicula()) return
    mostrarControlesReproductor(false)
    if (ctx.objetoAnimeActual?.titulo && playerEpTitulo) {
      playerEpTitulo.textContent = ctx.objetoAnimeActual.titulo
    }
    if (!playerEpLista) return
    playerEpLista.innerHTML = ''
    ctx.episodiosDelAnimeActual.forEach((ep, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className =
        'player-ep-item' + (i === ctx.indiceEpisodioActual ? ' player-ep-item--active' : '')
      const num = ep.episodio || i + 1
      const numSpan = document.createElement('span')
      numSpan.className = 'player-ep-item__num'
      numSpan.textContent = String(num)
      const titleSpan = document.createElement('span')
      titleSpan.className = 'player-ep-item__title'
      const sub = ctx.subtituloEpisodio
        ? ctx.subtituloEpisodio(ep, i)
        : ep.nombre || `Capítulo ${num}`
      titleSpan.textContent = sub
      btn.appendChild(numSpan)
      btn.appendChild(titleSpan)
      btn.onclick = () => {
        cerrarOverlayEpisodios()
        cambiarEpisodio(i)
      }
      playerEpLista.appendChild(btn)
    })
    playerEpOverlay.classList.add('is-open')
    playerEpOverlay.setAttribute('aria-hidden', 'false')
    window.dispatchEvent(
      new CustomEvent('nexus:player-ep-overlay', { detail: { abierto: true } })
    )
  }

  function resetControlesReproductor() {
    clearTimeout(timeoutControles)
    topBarReproductor.classList.remove('opacity-0', 'pointer-events-none')
    customControls.classList.remove('opacity-0', 'pointer-events-none')
    modalReproductor.style.cursor = 'default'
  }

  async function reproducirServidor(url) {
    const ctx = getCtx()
    const token = ++playbackToken

    destroyStreamHandle(ctx.streamHandle)
    ctx.streamHandle = null

    stopIframe({ iframe: iframePlayer })
    iframePlayer.classList.add('hidden')
    customControls.classList.add('hidden')
    mensajeReproductor.classList.add('hidden')

    const esTv = ctx.extensionActual === 'tv'
    const esVideoNativo = esTv || isStreamPlaybackUrl(url)

    if (esVideoNativo) {
      videoPlayer.classList.remove('hidden')
      customControls.classList.remove('hidden')
      customControls.classList.add('flex')

      await prepareVideoForPlayback(videoPlayer)

      const handle = await attachStream(videoPlayer, url, {
        onReady: function () {
          if (token !== playbackToken) return
          mensajeReproductor.classList.add('hidden')
          videoPlayer.play().catch(function () {})
          mostrarControlesReproductor()
        },
        onError: function () {
          if (token !== playbackToken) return
          mensajeReproductor.textContent = '❌ Error al reproducir el video. Prueba otro servidor.'
          mensajeReproductor.classList.remove('hidden')
        }
      })

      if (token !== playbackToken) {
        destroyStreamHandle(handle)
        return
      }
      ctx.streamHandle = handle
    } else {
      const iframeCtx = {
        iframe: iframePlayer,
        topBar: topBarReproductor,
        mensaje: mensajeReproductor
      }
      const ok = playViaIframe(url, iframeCtx)
      if (ok) {
        clearTimeout(timeoutControles)
        timeoutControles = setTimeout(function () {
          mensajeReproductor.classList.add('hidden')
        }, 5000)
      } else if (!isIframePlaybackEnabled()) {
        topBarReproductor.classList.remove('opacity-0', 'pointer-events-none')
      }
    }
  }

  Player.procesarReproduccion = async function procesarReproduccion(
    urlEpisodio,
    tituloPantalla,
    indexActual
  ) {
    const ctx = getCtx()
    ctx.urlEpisodioJugando = urlEpisodio
    ctx.indiceEpisodioActual = indexActual
    modalReproductor.classList.remove('hidden')
    window.dispatchEvent(new CustomEvent('nexus:player-abierto'))
    videoPlayer.classList.add('hidden')
    iframePlayer.classList.add('hidden')
    selectorServidor.classList.add('hidden')
    customControls.classList.add('hidden')

    tituloReproductor.textContent = tituloPantalla
    mensajeReproductor.classList.remove('hidden')
    mensajeReproductor.textContent = 'Buscando servidores...'

    progressBar.value = 0
    progressBar.style.background = `linear-gradient(to right, #dc2626 0%, #4b5563 0%)`
    lastSavedProgress = -1

    btnPrevEp.classList.toggle('hidden', ctx.indiceEpisodioActual <= 0)
    btnNextEp.classList.toggle(
      'hidden',
      ctx.indiceEpisodioActual >= ctx.episodiosDelAnimeActual.length - 1
    )
    actualizarBotonCapitulos()
    cerrarOverlayEpisodios()

    try {
      ctx.servidoresActuales = await apiFetch(
        `/providers/${ctx.extensionActual}/watch?url=${encodeURIComponent(urlEpisodio)}`
      )
      if (ctx.servidoresActuales.length === 0) throw new Error('No hay servidores')

      // Priorizar HLS nativo, luego Latino
      ctx.servidoresActuales.sort((a, b) => {
        const nameA = (a.server || a.nombre || '').toLowerCase()
        const nameB = (b.server || b.nombre || '').toLowerCase()
        const urlA = (a.url || '').toLowerCase()
        const urlB = (b.url || '').toLowerCase()

        const hlsA =
          isHlsServerName(nameA) || isStreamPlaybackUrl(a.url) ? 1 : 0
        const hlsB =
          isHlsServerName(nameB) || isStreamPlaybackUrl(b.url) ? 1 : 0
        if (hlsB !== hlsA) return hlsB - hlsA

        const isLatamA =
          nameA.includes('latam') ||
          nameA.includes('latino') ||
          nameA.includes('español') ||
          nameA.includes('castellano') ||
          nameA.includes('[lat]')
            ? 1
            : 0
        const isLatamB =
          nameB.includes('latam') ||
          nameB.includes('latino') ||
          nameB.includes('español') ||
          nameB.includes('castellano') ||
          nameB.includes('[lat]')
            ? 1
            : 0

        return isLatamB - isLatamA
      })

      mensajeReproductor.classList.add('hidden')
      selectorServidor.innerHTML = ''
      ctx.servidoresActuales.forEach((srv, index) => {
        const opt = document.createElement('option')
        opt.value = index
        opt.textContent = srv.server || srv.nombre || `Servidor ${index + 1}`
        selectorServidor.appendChild(opt)
      })
      selectorServidor.classList.remove('hidden')

      await reproducirServidor(ctx.servidoresActuales[0].url)
      selectorServidor.onchange = function (e) {
        reproducirServidor(ctx.servidoresActuales[e.target.value].url)
      }
    } catch (error) {
      mensajeReproductor.textContent = '❌ Error al cargar los servidores.'
    }
  }

  videoPlayer.addEventListener('loadedmetadata', () => {
    const ctx = getCtx()
    const progresoLocal = ctx.bibliotecaLocal.progreso[ctx.urlEpisodioJugando]
    if (ctx.forzarReinicio || (progresoLocal && progresoLocal.visto)) {
      videoPlayer.currentTime = 0
      ctx.forzarReinicio = false
    } else if (progresoLocal && progresoLocal.tiempo > 0) {
      videoPlayer.currentTime = progresoLocal.tiempo
    }
  })

  videoPlayer.addEventListener('timeupdate', () => {
    const ctx = getCtx()
    if (!videoPlayer.duration) return
    const percent = (videoPlayer.currentTime / videoPlayer.duration) * 100

    progressBar.value = percent
    progressBar.style.background = `linear-gradient(to right, #dc2626 ${percent}%, #4b5563 ${percent}%)`
    timeDisplay.textContent = `${formatTime(videoPlayer.currentTime)} / ${formatTime(videoPlayer.duration)}`

    if (Math.abs(videoPlayer.currentTime - lastSaveTime) > 10) {
      lastSaveTime = videoPlayer.currentTime
      const progresoActual = ctx.bibliotecaLocal.progreso[ctx.urlEpisodioJugando]
      const yaEstabaVisto = progresoActual ? progresoActual.visto : false
      const estaVisto = percent > 90 || yaEstabaVisto

      ctx.bibliotecaLocal.progreso[ctx.urlEpisodioJugando] = {
        tiempo: videoPlayer.currentTime,
        visto: estaVisto,
        duracion: videoPlayer.duration
      }

      if (Math.abs(videoPlayer.currentTime - lastSavedProgress) < 5) return
      lastSavedProgress = videoPlayer.currentTime

      libraryApi
        .saveProgress(
          ctx.objetoAnimeActual,
          ctx.urlEpisodioJugando,
          videoPlayer.currentTime,
          estaVisto,
          videoPlayer.duration
        )
        .then((nuevoHistorial) => (ctx.bibliotecaLocal.historial = nuevoHistorial))
    }
  })

  progressBar.addEventListener('input', (e) => {
    mostrarControlesReproductor(false)
    const percent = e.target.value
    progressBar.style.background = `linear-gradient(to right, #dc2626 ${percent}%, #4b5563 ${percent}%)`
    const time = (percent / 100) * videoPlayer.duration
    videoPlayer.currentTime = time
  })

  function togglePlayPause() {
    if (videoPlayer.paused) videoPlayer.play()
    else videoPlayer.pause()
  }
  btnPlayPause.addEventListener('click', togglePlayPause)
  videoPlayer.addEventListener('click', togglePlayPause)

  videoPlayer.addEventListener('play', () => {
    iconPlay.classList.add('hidden')
    iconPause.classList.remove('hidden')
    mostrarControlesReproductor()
  })
  videoPlayer.addEventListener('pause', () => {
    iconPause.classList.add('hidden')
    iconPlay.classList.remove('hidden')
    mostrarControlesReproductor(false)
  })

  btnNextEp.addEventListener('click', () => {
    const ctx = getCtx()
    if (ctx.indiceEpisodioActual < ctx.episodiosDelAnimeActual.length - 1) {
      cambiarEpisodio(ctx.indiceEpisodioActual + 1)
    }
  })

  btnPrevEp.addEventListener('click', () => {
    const ctx = getCtx()
    if (ctx.indiceEpisodioActual > 0) {
      cambiarEpisodio(ctx.indiceEpisodioActual - 1)
    }
  })

  videoPlayer.addEventListener('ended', () => {
    const ctx = getCtx()
    guardarProgresoEpisodioActual({ forzarCompletado: true }).then(() => {
      if (ctx.indiceEpisodioActual < ctx.episodiosDelAnimeActual.length - 1) {
        const nextIdx = ctx.indiceEpisodioActual + 1
        const nextEp = ctx.episodiosDelAnimeActual[nextIdx]
        Player.procesarReproduccion(nextEp.url, tituloParaEpisodio(nextEp, nextIdx), nextIdx)
      } else if (document.fullscreenElement) {
        document.exitFullscreen()
      }
    })
  })

  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement)
      modalReproductor.requestFullscreen().catch((err) => console.log(err))
    else document.exitFullscreen()
  })
  videoPlayer.addEventListener('dblclick', () => btnFullscreen.click())

  if (btnEpLista) btnEpLista.addEventListener('click', abrirOverlayEpisodios)
  if (playerEpCerrar) playerEpCerrar.addEventListener('click', cerrarOverlayEpisodios)
  if (playerEpOverlay) {
    playerEpOverlay.addEventListener('click', (e) => {
      if (e.target === playerEpOverlay) cerrarOverlayEpisodios()
    })
  }

  modalReproductor.addEventListener('mousemove', () => mostrarControlesReproductor())
  modalReproductor.addEventListener('click', () => mostrarControlesReproductor())

  btnCerrarReproductor.addEventListener('click', () => {
    const ctx = getCtx()
    if (document.fullscreenElement) document.exitFullscreen()
    resetControlesReproductor()
    modalReproductor.classList.add('hidden')

    guardarProgresoEpisodioActual().finally(function () {
      destroyStreamHandle(ctx.streamHandle)
      ctx.streamHandle = null
      stopIframe({ iframe: iframePlayer })
      prepareVideoForPlayback(videoPlayer)

      if (ctx.urlAnimeActual) ctx.abrirDetalles(ctx.urlAnimeActual, ctx.objetoAnimeActual.provider)
    })
  })

  Player.mostrarControles = mostrarControlesReproductor
  Player.ocultarControles = ocultarControlesReproductor
  Player.controlesVisibles = controlesEstanVisibles
  Player.cerrarOverlayEpisodios = cerrarOverlayEpisodios
  Player.overlayEpisodiosVisible = () =>
    Boolean(playerEpOverlay?.classList.contains('is-open'))

  cerrarOverlayEpisodios()

  return { procesarReproduccion: Player.procesarReproduccion }
}
