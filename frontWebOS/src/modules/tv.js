import { apiFetch } from '../services/apiClient.js'
import { libraryApi } from '../storage/library.js'
import { isBackKey, isEnterKey, isDeleteKey } from '../utils/keys.js'
import { activarTecladoVirtual, scrollIntoViewTV } from '../utils/platform.js'
import { attachStream, destroyStreamHandle, prepareVideoForPlayback } from '../utils/hlsPlayback.js'
import { bindPosterImage } from '../utils/images.js'

export function initTvModule() {
  let bibliotecaLocal = { favoritos: [], progreso: {}, historial: [] }

  // ==========================================================================
  // 📡 MODO TV EN VIVO (IPTV estilo Smarters Pro)
  // Experiencia dedicada: categorías -> canales -> reproductor con zapping,
  // overlay de canales sobre el video, buscador y favoritos. Totalmente
  // independiente de la navegación por catálogo para que se sienta como un IPTV.
  // ==========================================================================
  const tvApp = document.getElementById('tv-app')
  const tvPlayer = document.getElementById('tv-player')
  const tvVideo = document.getElementById('tv-video')
  const tvListaCategorias = document.getElementById('tv-lista-categorias')
  const tvGridCanales = document.getElementById('tv-grid-canales')
  const tvTituloCategoria = document.getElementById('tv-titulo-categoria')
  const tvContadorCanales = document.getElementById('tv-contador-canales')
  const tvBuscador = document.getElementById('tv-buscador')
  const tvBtnBuscar = document.getElementById('tv-btn-buscar')
  const tvBtnVolver = document.getElementById('tv-btn-volver')

  const tvPlayerTop = document.getElementById('tv-player-top')
  const tvPlayerHint = document.getElementById('tv-player-hint')
  const tvPlayerTitulo = document.getElementById('tv-player-titulo')
  const tvPlayerSub = document.getElementById('tv-player-sub')
  const tvPlayerLogo = document.getElementById('tv-player-logo')
  const tvPlayerMsg = document.getElementById('tv-player-msg')
  const tvBtnCerrarPlayer = document.getElementById('tv-btn-cerrar-player')
  const tvBtnFavPlayer = document.getElementById('tv-btn-fav-player')
  const tvIconoFavPlayer = document.getElementById('tv-icono-fav-player')
  const tvZapToast = document.getElementById('tv-zap-toast')
  const tvZapNombre = document.getElementById('tv-zap-nombre')
  const tvZapInfo = document.getElementById('tv-zap-info')

  const tvOverlay = document.getElementById('tv-overlay-canales')
  const tvOverlayCerrar = document.getElementById('tv-overlay-cerrar')
  const tvOverlayBuscador = document.getElementById('tv-overlay-buscador')
  const tvOverlayLista = document.getElementById('tv-overlay-lista')

  const PLACEHOLDER_LOGO =
    'data:image/svg+xml,' +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='80'><rect width='100%' height='100%' fill='#1d1d24'/><text x='50%' y='58%' font-size='34' text-anchor='middle' fill='#555'>TV</text></svg>"
    )

  // Pone la imagen de un canal de forma segura (sin romper el HTML por las comillas
  // del data-URI): asigna src por JS y cae al placeholder si el logo falla.
  function ponerLogoCanal(img, poster) {
    bindPosterImage(img, poster || PLACEHOLDER_LOGO)
  }

  let tvDatos = null // { categorias, canales }
  let tvCategoriaActual = 'todos'
  let tvBaseLista = [] // canales de la categoría actual (sin buscador)
  let tvCanalesVista = [] // base filtrada por buscador (lo que se muestra y se zapea)
  let tvCanalActual = null // objeto del canal en reproducción
  let tvIndiceActual = -1 // índice de tvCanalActual dentro de tvCanalesVista
  let tvStreamHandle = null
  let tvPlaybackToken = 0

  // Foco de teclado (mismo patrón que Inicio: HEADER → OK → modo edición)
  let tvZona = 'CATEGORIAS' // HEADER | CATEGORIAS | CANALES
  let tvModoEdicion = false
  let tvFocoHeader = 1
  let tvFocoCat = 0
  let tvFocoCanal = 0
  let tvOverlayVista = []
  let tvFocoOverlay = 0

  const TV_CANAL_LOTE = 48
  let tvRenderLimit = TV_CANAL_LOTE
  const TV_FOCO = ['ring-2', 'ring-sky-400', 'ring-offset-2', 'ring-offset-black', 'scale-[1.03]']

  function resetTvRenderLimit() {
    tvRenderLimit = TV_CANAL_LOTE
  }

  function expandTvRenderIfNeeded(focoIdx) {
    if (focoIdx >= tvRenderLimit - 8 && tvRenderLimit < tvCanalesVista.length) {
      tvRenderLimit = Math.min(tvRenderLimit + TV_CANAL_LOTE, tvCanalesVista.length)
      const prevFoco = tvFocoCanal
      renderCanalesTv(false)
      tvFocoCanal = prevFoco
      return true
    }
    return false
  }

  const mostrarTv = (el) => {
    el.classList.remove('hidden')
    el.classList.add('flex')
  }
  const ocultarTv = (el) => {
    el.classList.add('hidden')
    el.classList.remove('flex')
  }

  function esFavTv(url) {
    return bibliotecaLocal.favoritos.some((f) => f.url === url)
  }

  function canalAObjetoFav(c) {
    return {
      titulo: c.titulo,
      url: c.url,
      poster: c.poster || '',
      provider: 'tv',
      stream: c.stream,
      grupo: c.grupo,
      pais: c.pais
    }
  }

  // ---------- ABRIR / CERRAR ----------
  async function abrirTvApp() {
    mostrarTv(tvApp)
    tvApp.classList.add('flex-col')
    if (!tvDatos) {
      tvListaCategorias.innerHTML =
        '<p class="text-xs text-gray-500 px-2 animate-pulse">Cargando canales...</p>'
      try {
        tvDatos = await apiFetch('/tv/data')
      } catch (e) {
        tvListaCategorias.innerHTML =
          '<p class="text-xs text-red-500 px-2">Error al cargar la TV.</p>'
        return
      }
    }
    renderCategoriasTv()
    seleccionarCategoriaTv('todos')
    tvModoEdicion = false
    tvZona = 'CATEGORIAS'
    tvFocoCat = 0
    pintarFocoTv()
  }

  function cerrarTvApp() {
    cerrarTvPlayer()
    ocultarTv(tvApp)
  }

  tvBtnVolver.addEventListener('click', cerrarTvApp)

  // ---------- CATEGORÍAS ----------
  function renderCategoriasTv() {
    tvListaCategorias.innerHTML = ''
    tvDatos.categorias.forEach((cat) => {
      const btn = document.createElement('button')
      btn.className =
        'tv-cat foco-item text-left w-full text-gray-300 hover:text-white hover:bg-white/5 px-3 py-3 rounded-lg transition font-medium text-base flex items-center justify-between gap-2'
      btn.dataset.cat = cat.id
      const count =
        cat.id === 'favoritos'
          ? bibliotecaLocal.favoritos.filter((f) => f.provider === 'tv').length
          : cat.count
      btn.innerHTML = `<span class="truncate">${cat.nombre}</span><span class="text-xs text-gray-600 shrink-0">${count ?? ''}</span>`
      btn.onclick = () => {
        seleccionarCategoriaTv(cat.id)
        tvZona = 'CANALES'
        tvFocoCanal = 0
        pintarFocoTv()
      }
      tvListaCategorias.appendChild(btn)
    })
  }

  function listaBaseDeCategoria(catId) {
    const canales = tvDatos.canales
    if (catId === 'todos') return canales
    if (catId === 'favoritos') {
      return bibliotecaLocal.favoritos.filter((f) => f.provider === 'tv')
    }
    if (catId.startsWith('cat:')) {
      const tipo = catId.slice(4)
      return canales.filter((c) => c.categoria === tipo)
    }
    if (catId.startsWith('pais:')) {
      const pais = catId.slice(5)
      return canales.filter((c) => c.pais === pais)
    }
    return canales
  }

  function seleccionarCategoriaTv(catId) {
    tvCategoriaActual = catId
    const cat = tvDatos.categorias.find((c) => c.id === catId)
    tvTituloCategoria.textContent = cat ? cat.nombre : 'Canales'
    tvBaseLista = listaBaseDeCategoria(catId)
    tvBuscador.value = ''
    renderCanalesTv()
    tvListaCategorias.querySelectorAll('.tv-cat').forEach((b) => {
      b.classList.toggle('bg-sky-500/15', b.dataset.cat === catId)
      b.classList.toggle('text-white', b.dataset.cat === catId)
    })
  }

  // ---------- CANALES (grid) ----------
  function renderCanalesTv(resetLimit = true) {
    const q = tvBuscador.value.trim().toLowerCase()
    if (resetLimit && !q) resetTvRenderLimit()

    if (q && tvDatos?.canales) {
      tvCanalesVista = tvDatos.canales.filter((c) => c.titulo.toLowerCase().includes(q))
      tvTituloCategoria.textContent = `🔍 Canales: "${tvBuscador.value.trim()}"`
    } else {
      tvCanalesVista = tvBaseLista
      tvTituloCategoria.textContent = tituloCategoriaActual()
    }

    tvContadorCanales.textContent = `${tvCanalesVista.length} canales`
    tvGridCanales.innerHTML = ''

    if (tvCanalesVista.length === 0) {
      tvGridCanales.innerHTML =
        '<p class="text-gray-500 col-span-full text-center py-10 text-base">No hay canales aquí.</p>'
      return
    }

    const limite = q ? tvCanalesVista.length : tvRenderLimit
    const slice = tvCanalesVista.slice(0, limite)
    slice.forEach((c, i) => {
      tvGridCanales.appendChild(crearTarjetaCanal(c, i))
    })
    if (!q && tvCanalesVista.length > tvRenderLimit) {
      const hint = document.createElement('p')
      hint.className = 'text-gray-500 col-span-full text-center py-3 text-sm'
      hint.textContent = `Mostrando ${tvRenderLimit} de ${tvCanalesVista.length} — sigue bajando para cargar más`
      tvGridCanales.appendChild(hint)
    }
  }

  function tvHeaderItems() {
    return [tvBtnVolver, tvBuscador, tvBtnBuscar].filter(Boolean)
  }

  function tituloCategoriaActual() {
    const cat = tvDatos?.categorias?.find((c) => c.id === tvCategoriaActual)
    return cat ? cat.nombre : 'Canales'
  }

  function aplicarBusquedaTv() {
    tvModoEdicion = false
    tvBuscador.blur()
    tvBuscador.classList.remove('tv-buscador-activo', 'foco-edicion')
    renderCanalesTv(true)
    tvZona = 'CANALES'
    tvFocoCanal = 0
    pintarFocoTv()
  }

  function entrarEdicionTvBuscador() {
    tvModoEdicion = true
    tvZona = 'HEADER'
    tvFocoHeader = Math.max(0, tvHeaderItems().indexOf(tvBuscador))
    pintarFocoTv()
    activarTecladoVirtual(tvBuscador)
  }

  function salirEdicionTvBuscador(volverACanales) {
    tvModoEdicion = false
    tvBuscador.blur()
    tvBuscador.classList.remove('tv-buscador-activo', 'foco-edicion')
    if (volverACanales) {
      aplicarBusquedaTv()
    } else {
      tvZona = 'HEADER'
      pintarFocoTv()
    }
  }

  function irATvHeader(idx) {
    if (tvModoEdicion) salirEdicionTvBuscador(false)
    tvZona = 'HEADER'
    tvFocoHeader = idx
    pintarFocoTv()
  }

  function crearTarjetaCanal(c, i) {
    const card = document.createElement('div')
    card.className =
      'tv-canal group relative rounded-xl overflow-hidden cursor-pointer bg-surface ring-1 ring-white/5 hover:ring-2 hover:ring-sky-500 transition p-3 flex flex-col items-center gap-2 min-h-[240px] h-full'
    card.dataset.idx = i
    const fav = esFavTv(c.url)
    card.innerHTML = `
  <div class="w-full h-36 flex items-center justify-center bg-surface2 rounded-lg overflow-hidden p-3 flex-shrink-0">
    <img class="tv-logo h-full w-full object-contain" loading="lazy" />
  </div>

  <div class="flex flex-col flex-1 w-full">
    <p class="tv-nombre text-base font-semibold text-center w-full leading-snug break-words line-clamp-3">
      ${c.titulo || 'Canal'}
    </p>

    <span class="text-[11px] text-gray-500 w-full text-center mt-auto">
      ${c.pais || ''}
    </span>
  </div>

  <span class="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase bg-red-600 text-white px-1.5 py-0.5 rounded">
    ● Vivo
  </span>

  <button class="tv-fav absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur transition ${
    fav ? 'bg-sky-500 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100'
  }" title="Favorito">
    ⭐
  </button>
`
    ponerLogoCanal(card.querySelector('.tv-logo'), c.poster)
    card.onclick = (e) => {
      if (e.target.closest('.tv-fav')) return
      reproducirCanalPorIndice(i)
    }
    card.querySelector('.tv-fav').onclick = async (e) => {
      e.stopPropagation()
      await toggleFavTv(c)
      renderCategoriasTv()
      seleccionarCategoriaTv(tvCategoriaActual)
    }
    return card
  }

  let tvFilterTimer = null

  function filtrarCanalesEnVivo() {
    if (!tvModoEdicion) return
    clearTimeout(tvFilterTimer)
    tvFilterTimer = setTimeout(() => renderCanalesTv(false), 220)
  }

  if (tvBuscador) {
    tvBuscador.addEventListener('input', filtrarCanalesEnVivo)
    tvBuscador.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (isDeleteKey(e) || (e.key && e.key.length === 1)) {
        return
      }
      if (isEnterKey(e)) {
        e.preventDefault()
        aplicarBusquedaTv()
      }
    })
  }

  if (tvBtnBuscar) {
    tvBtnBuscar.addEventListener('click', () => aplicarBusquedaTv())
  }

  async function toggleFavTv(c) {
    bibliotecaLocal.favoritos = await libraryApi.toggleFavorite(canalAObjetoFav(c))
  }

  // ---------- REPRODUCTOR DE TV ----------
  function reproducirCanalPorIndice(i) {
    if (i < 0 || i >= tvCanalesVista.length) return
    tvIndiceActual = i
    tvCanalActual = tvCanalesVista[i]
    abrirTvPlayer(tvCanalActual)
  }

  let timeoutControlesTv

  function mostrarControlesTv(autoOcultar = true) {
    if (overlayAbierto()) return
    tvPlayerTop.classList.remove('opacity-0', 'pointer-events-none')
    tvPlayerHint.classList.remove('opacity-0')
    tvPlayer.style.cursor = 'default'
    clearTimeout(timeoutControlesTv)
    if (autoOcultar) {
      timeoutControlesTv = setTimeout(ocultarControlesTv, 3000)
    }
  }

  function ocultarControlesTv() {
    if (overlayAbierto()) return
    tvPlayerTop.classList.add('opacity-0', 'pointer-events-none')
    tvPlayerHint.classList.add('opacity-0')
    tvPlayer.style.cursor = 'none'
  }

  tvPlayer.addEventListener('mousemove', () => mostrarControlesTv())
  tvPlayer.addEventListener('click', () => mostrarControlesTv())

  function abrirTvPlayer(canal) {
    tvPlayer.classList.remove('hidden')
    tvPlayer.style.display = 'block'
    ocultarOverlayCanales()
    actualizarInfoPlayer(canal)
    reproducirStreamTv(canal.stream)
    mostrarControlesTv()
  }

  function actualizarInfoPlayer(canal) {
    tvPlayerTitulo.textContent = canal.titulo
    tvPlayerSub.textContent = [canal.pais, canal.grupo].filter(Boolean).join(' · ')
    if (canal.poster) {
      tvPlayerLogo.src = canal.poster
      tvPlayerLogo.classList.remove('hidden')
      tvPlayerLogo.onerror = () => tvPlayerLogo.classList.add('hidden')
    } else {
      tvPlayerLogo.classList.add('hidden')
    }
    const fav = esFavTv(canal.url)
    tvIconoFavPlayer.textContent = fav ? '⭐' : '☆'
    tvBtnFavPlayer.classList.toggle('bg-sky-500', fav)
    tvBtnFavPlayer.classList.toggle('bg-white/10', !fav)
  }

  async function reproducirStreamTv(url) {
    const token = ++tvPlaybackToken

    destroyStreamHandle(tvStreamHandle)
    tvStreamHandle = null

    tvPlayerMsg.textContent = 'Sintonizando...'
    tvPlayerMsg.classList.remove('hidden')

    const onOk = function () {
      tvPlayerMsg.classList.add('hidden')
    }
    const onErr = function () {
      tvPlayerMsg.textContent = '❌ Señal no disponible. Prueba otro canal.'
      tvPlayerMsg.classList.remove('hidden')
    }

    await prepareVideoForPlayback(tvVideo)

    const handle = await attachStream(tvVideo, url, {
      onReady: function () {
        if (token !== tvPlaybackToken) return
        tvVideo.play().then(onOk).catch(onOk)
      },
      onError: function () {
        if (token !== tvPlaybackToken) return
        onErr()
      }
    })

    if (token !== tvPlaybackToken) {
      destroyStreamHandle(handle)
      return
    }
    tvStreamHandle = handle
  }

  async function cerrarTvPlayer() {
    destroyStreamHandle(tvStreamHandle)
    tvStreamHandle = null
    await prepareVideoForPlayback(tvVideo)
    clearTimeout(timeoutControlesTv)
    tvPlayerTop.classList.remove('opacity-0', 'pointer-events-none')
    tvPlayerHint.classList.remove('opacity-0')
    tvPlayer.style.cursor = 'default'
    ocultarOverlayCanales()
    tvPlayer.classList.add('hidden')
    tvPlayer.style.display = 'none'
  }

  tvBtnCerrarPlayer.addEventListener('click', cerrarTvPlayer)

  tvBtnFavPlayer.addEventListener('click', async () => {
    if (!tvCanalActual) return
    await toggleFavTv(tvCanalActual)
    actualizarInfoPlayer(tvCanalActual)
    mostrarControlesTv()
  })

  // Zapping (cambio de canal sin salir del reproductor)
  function zapTv(delta) {
    if (tvCanalesVista.length === 0) return
    let nuevo = tvIndiceActual + delta
    if (nuevo < 0) nuevo = tvCanalesVista.length - 1
    if (nuevo >= tvCanalesVista.length) nuevo = 0
    tvIndiceActual = nuevo
    tvCanalActual = tvCanalesVista[nuevo]
    actualizarInfoPlayer(tvCanalActual)
    reproducirStreamTv(tvCanalActual.stream)
    mostrarZapToast(tvCanalActual, nuevo)
    mostrarControlesTv()
  }

  let tvZapTimeout
  function mostrarZapToast(canal, idx) {
    tvZapNombre.textContent = canal.titulo
    tvZapInfo.textContent = `Canal ${idx + 1} de ${tvCanalesVista.length} · ${canal.pais || ''}`
    tvZapToast.classList.remove('hidden')
    clearTimeout(tvZapTimeout)
    tvZapTimeout = setTimeout(() => tvZapToast.classList.add('hidden'), 2200)
  }

  // ---------- OVERLAY GRIS DE CANALES (sobre el video) ----------
  function abrirOverlayCanales() {
    clearTimeout(timeoutControlesTv)
    ocultarControlesTv()
    tvOverlayBuscador.value = ''
    renderOverlayCanales()
    mostrarTv(tvOverlay)
    tvOverlay.classList.add('flex-col')
    tvFocoOverlay = Math.max(
      0,
      tvOverlayVista.findIndex((c) => c.url === (tvCanalActual && tvCanalActual.url))
    )
    pintarFocoOverlay()
    setTimeout(() => tvOverlayBuscador.focus(), 50)
  }

  function ocultarOverlayCanales(mostrarControles = false) {
    ocultarTv(tvOverlay)
    if (mostrarControles && !tvPlayer.classList.contains('hidden')) mostrarControlesTv()
  }

  function overlayAbierto() {
    return !tvOverlay.classList.contains('hidden')
  }

  function toggleOverlayCanales() {
    if (overlayAbierto()) ocultarOverlayCanales(true)
    else abrirOverlayCanales()
  }

  tvOverlayCerrar.addEventListener('click', () => ocultarOverlayCanales(true))

  function renderOverlayCanales() {
    const q = tvOverlayBuscador.value.trim().toLowerCase()
    tvOverlayVista = q
      ? tvCanalesVista.filter((c) => c.titulo.toLowerCase().includes(q))
      : tvCanalesVista
    tvOverlayLista.innerHTML = ''
    tvOverlayVista.forEach((c, i) => {
      const row = document.createElement('button')
      const activo = tvCanalActual && c.url === tvCanalActual.url
      row.className = `tv-ov-item w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition ${activo ? 'bg-sky-500/20' : 'hover:bg-white/10'}`
      row.dataset.idx = i
      row.innerHTML = `
      <img class="tv-logo w-10 h-7 object-contain rounded bg-black/30 shrink-0" />
      <span class="truncate text-sm flex-1">${c.titulo || 'Canal'}</span>
      ${esFavTv(c.url) ? '<span class="text-sky-400 text-xs">⭐</span>' : ''}
    `
      ponerLogoCanal(row.querySelector('.tv-logo'), c.poster)
      row.onclick = () => seleccionarCanalDesdeOverlay(i)
      tvOverlayLista.appendChild(row)
    })
  }

  function seleccionarCanalDesdeOverlay(i) {
    const canal = tvOverlayVista[i]
    if (!canal) return
    const idxVista = tvCanalesVista.findIndex((c) => c.url === canal.url)
    if (idxVista >= 0) tvIndiceActual = idxVista
    tvCanalActual = canal
    actualizarInfoPlayer(canal)
    reproducirStreamTv(canal.stream)
    mostrarZapToast(canal, tvIndiceActual >= 0 ? tvIndiceActual : i)
    ocultarOverlayCanales(true)
  }

  tvOverlayBuscador.addEventListener('input', () => {
    renderOverlayCanales()
    tvFocoOverlay = 0
    pintarFocoOverlay()
  })

  // ---------- FOCO VISUAL (teclado / control USB) ----------

  function limpiarFocoTv() {
    document.querySelectorAll('.tv-foco').forEach((el) => el.classList.remove('tv-foco', ...TV_FOCO))
    if (tvBuscador) tvBuscador.classList.remove('foco-edicion', 'tv-buscador-activo')
  }

  function pintarFocoTv() {
    limpiarFocoTv()
    let el = null
    if (tvZona === 'HEADER') {
      const items = tvHeaderItems()
      tvFocoHeader = Math.max(0, Math.min(tvFocoHeader, items.length - 1))
      el = items[tvFocoHeader]
    } else if (tvZona === 'CATEGORIAS') {
      const els = tvListaCategorias.querySelectorAll('.tv-cat')
      tvFocoCat = Math.max(0, Math.min(tvFocoCat, els.length - 1))
      el = els[tvFocoCat]
    } else {
      const els = tvGridCanales.querySelectorAll('.tv-canal')
      tvFocoCanal = Math.max(0, Math.min(tvFocoCanal, els.length - 1))
      el = els[tvFocoCanal]
    }
    if (el) {
      el.classList.add('tv-foco', ...TV_FOCO)
      if (el === tvBuscador && tvModoEdicion) el.classList.add('foco-edicion', 'tv-buscador-activo')
      scrollIntoViewTV(el, true)
    }
  }

  function pintarFocoOverlay() {
    const els = tvOverlayLista.querySelectorAll('.tv-ov-item')
    els.forEach((e) => e.classList.remove('bg-sky-500/40'))
    tvFocoOverlay = Math.max(0, Math.min(tvFocoOverlay, els.length - 1))
    const el = els[tvFocoOverlay]
    if (el) {
      el.classList.add('bg-sky-500/40')
      scrollIntoViewTV(el, true)
    }
  }

  function columnasGridCanales() {
    const estilo = getComputedStyle(tvGridCanales).gridTemplateColumns
    return estilo ? estilo.split(' ').filter(Boolean).length : 5
  }

  // ---------- TECLADO (captura, prioritario sobre la navegación normal) ----------
  window.addEventListener(
    'keydown',
    (e) => {
      const playerVisible = !tvPlayer.classList.contains('hidden')
      const appVisible = !tvApp.classList.contains('hidden')
      if (!playerVisible && !appVisible) return

      // ===== REPRODUCTOR DE TV =====
      if (playerVisible) {
        e.stopPropagation()

        if (overlayAbierto()) {
          const enBuscador = document.activeElement === tvOverlayBuscador
          if (isBackKey(e)) {
            ocultarOverlayCanales(true)
            e.preventDefault()
          } else if (e.key === 'ArrowDown') {
            if (enBuscador) tvOverlayBuscador.blur()
            tvFocoOverlay++
            pintarFocoOverlay()
            e.preventDefault()
          } else if (e.key === 'ArrowUp') {
            if (tvFocoOverlay === 0) {
              tvOverlayBuscador.focus()
            } else {
              tvFocoOverlay--
              pintarFocoOverlay()
            }
            e.preventDefault()
          } else if (isEnterKey(e)) {
            if (enBuscador) {
              tvOverlayBuscador.blur()
              pintarFocoOverlay()
            } else {
              seleccionarCanalDesdeOverlay(tvFocoOverlay)
            }
            e.preventDefault()
          }
          return
        }

        if (isBackKey(e)) {
          cerrarTvPlayer()
          e.preventDefault()
        } else if (e.key === 'ArrowUp' || e.key === 'ChannelUp' || e.key === 'PageUp') {
          zapTv(-1)
          e.preventDefault()
        } else if (e.key === 'ArrowDown' || e.key === 'ChannelDown' || e.key === 'PageDown') {
          zapTv(1)
          e.preventDefault()
        } else if (isEnterKey(e) || e.key === ' ' || e.key === 'OK') {
          toggleOverlayCanales()
          e.preventDefault()
        } else if (e.key.toLowerCase() === 'f') {
          if (tvCanalActual)
            toggleFavTv(tvCanalActual).then(() => actualizarInfoPlayer(tvCanalActual))
          mostrarControlesTv()
          e.preventDefault()
        }
        return
      }

      // ===== NAVEGADOR IPTV (header / categorías / canales) =====
      e.stopPropagation()

      // Modo edición del buscador (igual que Inicio: OK activa, escribe, Enter busca)
      if (tvModoEdicion) {
        if (isDeleteKey(e)) {
          return
        }
        if (isBackKey(e)) {
          salirEdicionTvBuscador(false)
          e.preventDefault()
          return
        }
        if (e.key === 'ArrowDown') {
          aplicarBusquedaTv()
          e.preventDefault()
          return
        }
        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          return
        }
        return
      }

      if (tvZona === 'HEADER') {
        const items = tvHeaderItems()
        if (e.key === 'ArrowRight') tvFocoHeader = Math.min(tvFocoHeader + 1, items.length - 1)
        else if (e.key === 'ArrowLeft') tvFocoHeader = Math.max(tvFocoHeader - 1, 0)
        else if (e.key === 'ArrowDown') {
          tvZona = 'CATEGORIAS'
          tvFocoCat = 0
        } else if (isEnterKey(e)) {
          const el = items[tvFocoHeader]
          if (el === tvBuscador) entrarEdicionTvBuscador()
          else el?.click()
          e.preventDefault()
          if (el !== tvBuscador) pintarFocoTv()
          return
        }
        pintarFocoTv()
        e.preventDefault()
        return
      }

      if (isBackKey(e)) {
        cerrarTvApp()
        e.preventDefault()
        return
      }

      if (e.key.toLowerCase() === 'f' && tvZona === 'CANALES') {
        const c = tvCanalesVista[tvFocoCanal]
        if (c)
          toggleFavTv(c).then(() => {
            renderCategoriasTv()
            seleccionarCategoriaTv(tvCategoriaActual)
            pintarFocoTv()
          })
        e.preventDefault()
        return
      }

      if (tvZona === 'CATEGORIAS') {
        const els = tvListaCategorias.querySelectorAll('.tv-cat')
        if (e.key === 'ArrowDown') tvFocoCat = Math.min(tvFocoCat + 1, els.length - 1)
        else if (e.key === 'ArrowUp') {
          if (tvFocoCat === 0) {
            irATvHeader(1)
            e.preventDefault()
            return
          }
          tvFocoCat = Math.max(tvFocoCat - 1, 0)
        } else if (e.key === 'ArrowRight' || isEnterKey(e)) {
          if (els[tvFocoCat]) els[tvFocoCat].click()
          if (e.key === 'ArrowRight') {
            tvZona = 'CANALES'
            tvFocoCanal = 0
          }
        }
        pintarFocoTv()
        e.preventDefault()
      } else if (tvZona === 'CANALES') {
        const cols = columnasGridCanales()
        const q = tvBuscador.value.trim()
        const limite = q ? tvCanalesVista.length : tvRenderLimit
        const total = Math.min(tvCanalesVista.length, limite)
        if (e.key === 'ArrowRight') tvFocoCanal = Math.min(tvFocoCanal + 1, total - 1)
        else if (e.key === 'ArrowLeft') {
          if (tvFocoCanal % cols === 0) tvZona = 'CATEGORIAS'
          else tvFocoCanal--
        } else if (e.key === 'ArrowDown') {
          tvFocoCanal = Math.min(tvFocoCanal + cols, total - 1)
          expandTvRenderIfNeeded(tvFocoCanal)
        } else if (e.key === 'ArrowUp') {
          if (tvFocoCanal < cols) {
            irATvHeader(1)
            e.preventDefault()
            return
          }
          tvFocoCanal -= cols
        } else if (isEnterKey(e)) {
          reproducirCanalPorIndice(tvFocoCanal)
        }
        pintarFocoTv()
        e.preventDefault()
      }
    },
    true
  )

  return {
    bindBiblioteca(lib) {
      bibliotecaLocal = lib
    },
    abrirTvApp,
    invalidarCache() {
      tvDatos = null
      tvCategoriaActual = 'todos'
      tvBaseLista = []
      tvCanalesVista = []
      tvCanalActual = null
      tvIndiceActual = -1
    }
  }
}
