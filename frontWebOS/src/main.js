/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
import './styles/fonts.css'
import './styles/main.css'
import { apiFetch, mostrarErrorApi, mostrarToastExito } from './services/apiClient.js'
import { libraryApi } from './storage/library.js'
import { isBackKey, isEnterKey, isSelectKey } from './utils/keys.js'
import { isWebOS } from './utils/platform.js'
import { bindPosterImage } from './utils/images.js'
import { formatTime } from './utils/formatTime.js'
import { initTvModule } from './modules/tv.js'
import {
  Player,
  iniciarReproduccion,
  setPlayerContextFactory
} from './modules/playerBridge.js'
import { initSettingsModule } from './modules/settings.js'

const Tv = initTvModule()
const abrirTvApp = () => Tv.abrirTvApp()

/** Límites de memoria en Smart TV (WebOS). */
const MAX_ITEMS_CARRUSEL = isWebOS() ? 14 : 24
const MAX_HISTORIAL_FILA = isWebOS() ? 12 : 20
const SKELETON_COUNT = isWebOS() ? 8 : 12

// ==========================================
// ESTADO GLOBAL DE LA APP
// ==========================================
let extensionActual = null
let bibliotecaLocal = { favoritos: [], progreso: {}, historial: [] }

let paginaActual = 1
let busquedaActual = ''
let filtrosActuales = {}
let catalogFetchGen = 0

let episodiosDelAnimeActual = []
let indiceEpisodioActual = -1
let urlEpisodioJugando = ''
let streamHandle = null
let servidoresActuales = []
let forzarReinicio = false
let urlAnimeActual = ''
let objetoAnimeActual = null

// ==========================================
// ELEMENTOS DEL DOM
// ==========================================
const gridCatalogo = document.getElementById('grid-catalogo')
const tituloSeccion = document.getElementById('titulo-seccion')
const inputBuscador = document.getElementById('input-buscador')

const detalleEstado = document.getElementById('detalle-estado')

const btnBusquedaGlobal = document.getElementById('btn-busqueda-global')

const btnInicio = document.getElementById('btn-inicio')
const btnFavoritos = document.getElementById('btn-favoritos')
const btnHistorial = document.getElementById('btn-historial')
const btnAtras = document.getElementById('btn-atras')
const topNav = document.getElementById('top-nav')

// Muestra/oculta el botón "Atrás" de la barra superior (volver al Inicio)
function mostrarAtras() {
  btnAtras.classList.remove('hidden')
  btnAtras.classList.add('flex')
}
function ocultarAtras() {
  btnAtras.classList.add('hidden')
  btnAtras.classList.remove('flex')
}
if (btnAtras) btnAtras.addEventListener('click', () => cargarInicio())

const contenedorPaginacion = document.getElementById('contenedor-paginacion')
const btnPaginaAnterior = document.getElementById('btn-pagina-anterior')
const btnPaginaSiguiente = document.getElementById('btn-pagina-siguiente')
const textoPagina = document.getElementById('texto-pagina')
const contenedorFiltros = document.getElementById('contenedor-filtros')

const modalDetalles = document.getElementById('modal-detalles')
const btnCerrarModal = document.getElementById('btn-cerrar-modal')
const detalleTitulo = document.getElementById('detalle-titulo')
const detalleSinopsis = document.getElementById('detalle-sinopsis')
const detallePoster = document.getElementById('detalle-poster')
const detalleAño = document.getElementById('detalle-año')
const detalleCalificacion = document.getElementById('detalle-calificacion')
const detalleGeneros = document.getElementById('detalle-generos')
const detalleProvider = document.getElementById('detalle-provider')
const detalleHeroBg = document.getElementById('detalle-hero-bg')
const detalleEpCount = document.getElementById('detalle-ep-count')
const listaEpisodios = document.getElementById('lista-episodios')
const detailEpisodesBlock = document.querySelector('.detail-episodes-block')

const btnDetalleFav = document.getElementById('btn-detalle-fav')
const iconoFavDetalle = document.getElementById('icono-fav-detalle')
const btnDetalleReset = document.getElementById('btn-detalle-reset')
const btnDetallePlay = document.getElementById('btn-detalle-play')
const textoDetallePlay = document.getElementById('texto-detalle-play')

const mainScroll = document.getElementById('main-scroll')

let providersMeta = {}
let extensionesLista = []

// ==========================================
// HELPERS DE INTERFAZ
// ==========================================
function metaDe(providerId) {
  return providersMeta[providerId] || { nombre: providerId, icono: '📺', color: '#e50914' }
}

/** ID de extensión activa para catálogo paginado (excluye inicio, global, fav, etc.). */
function providerCatalogoActivo() {
  const id = extensionActual
  if (!id || typeof id !== 'string') return null
  if (id === 'inicio' || id === 'global' || id === 'favoritos' || id === 'historial') return null
  if (id.startsWith('cat:')) return null
  return id
}

function esContenidoPelicula(episodios, detalles) {
  if (!episodios || episodios.length === 0) return false

  const tipo = (detalles?.tipo || detalles?.type || '').toLowerCase()
  if (tipo === 'pelicula' || tipo === 'movie' || tipo === 'film') return true

  const generos = (detalles?.generos || []).join(' ').toLowerCase()
  if (/pel[ií]cula|movie|film/.test(generos)) return true

  if (detalles?.esPelicula === true) return true

  const sinTemporadas = episodios.every((ep) => ep.temporada == null || ep.temporada === '')
  if (sinTemporadas && episodios.length === 1) {
    const ep = episodios[0]
    if (ep.nombre === 'Película') return true
    if (/^pel[ií]cula$/i.test(ep.nombre || '')) return true
  }

  if (sinTemporadas && episodios.length > 1 && tipo !== 'serie' && tipo !== 'anime') {
    const parecenPartes = episodios.every(
      (ep) =>
        /pel[ií]cula|completa|full|movie|parte/i.test(ep.nombre || '') ||
        (ep.nombre || '').trim() === (detalles?.titulo || '').trim()
    )
    if (parecenPartes) return true
  }

  return false
}

function subtituloEpisodio(ep, index) {
  const num = ep.episodio || index + 1
  if (
    ep.nombre &&
    !/^pel[ií]cula$/i.test(ep.nombre) &&
    !/^(cap[ií]tulo|episodio)\s*\d/i.test(ep.nombre)
  ) {
    return ep.nombre
  }
  return `Capítulo ${num}`
}

function tituloReproduccion(ep, index, serieTitulo) {
  if (esContenidoPelicula(episodiosDelAnimeActual, objetoAnimeActual)) {
    return serieTitulo || ep.nombre || 'Reproduciendo'
  }
  const sub = subtituloEpisodio(ep, index)
  return serieTitulo ? `${serieTitulo} · ${sub}` : sub
}

function porcentajeProgresoEpisodio(progreso, ep) {
  const dur = progreso?.duracion || ep?.duracion
  if (!dur || dur <= 0 || !progreso?.tiempo) return null
  return Math.min(100, Math.round((progreso.tiempo / dur) * 100))
}

function marcarNavActiva(boton) {
  document
    .querySelectorAll('.nav-item, #btn-busqueda-global')
    .forEach((b) => b.classList.remove('nav-activa', 'ring-2', 'ring-brand', 'bg-white/5'))
  if (boton) {
    if (boton.classList.contains('nav-item') || boton.id === 'btn-busqueda-global') {
      boton.classList.add('nav-activa')
    }
  }
}

const CLASES_GRID =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5'
const CLASES_FILAS = 'flex flex-col gap-9 md:gap-10 overflow-visible'

function aplicarLayoutGrid() {
  gridCatalogo.className = CLASES_GRID
}
function aplicarLayoutFilas() {
  gridCatalogo.className = CLASES_FILAS
}

function mostrarSkeletons(cantidad) {
  if (cantidad === undefined) cantidad = SKELETON_COUNT
  aplicarLayoutGrid()
  gridCatalogo.innerHTML = Array.from({ length: cantidad })
    .map(
      () => `
      <div class="rounded-xl overflow-hidden">
        <div class="skeleton w-full aspect-[2/3] rounded-xl"></div>
        <div class="skeleton h-3 rounded mt-2 w-3/4"></div>
      </div>`
    )
    .join('')
}

function mostrarSkeletonFilas(filas = 3) {
  aplicarLayoutFilas()
  gridCatalogo.innerHTML = Array.from({ length: filas })
    .map(
      () => `
      <section>
        <div class="skeleton h-5 w-48 rounded mb-4"></div>
        <div class="flex gap-4 overflow-hidden">
          ${Array.from({ length: 8 })
            .map(
              () =>
                '<div class="w-36 sm:w-40 md:w-44 shrink-0"><div class="skeleton w-full aspect-[2/3] rounded-xl"></div></div>'
            )
            .join('')}
        </div>
      </section>`
    )
    .join('')
}

// Construye una fila (carrusel horizontal) estilo Netflix
function crearFila(fila) {
  const section = document.createElement('section')
  section.className = 'w-full overflow-visible'

  const icono = fila.icono
    ? `<span class="w-7 h-7 rounded-md flex items-center justify-center text-base" style="background:${(fila.color || '#e50914') + '33'}">${fila.icono}</span>`
    : ''

  section.innerHTML = `
    <h3 class="section-title">${icono}<span>${fila.titulo}</span></h3>
    <div class="carousel-row relative group/row">
      <button type="button" class="fila-prev absolute left-0 top-0 bottom-8 z-30 w-10 md:w-14 bg-gradient-to-r from-[#08080a] to-transparent text-white text-3xl opacity-0 group-hover/row:opacity-100 transition flex items-center justify-center hover:text-white">‹</button>
      <div class="fila-scroll flex gap-3 md:gap-4 overflow-x-auto scroll-smooth snap-x"></div>
      <button type="button" class="fila-next absolute right-0 top-0 bottom-8 z-30 w-10 md:w-14 bg-gradient-to-l from-[#08080a] to-transparent text-white text-3xl opacity-0 group-hover/row:opacity-100 transition flex items-center justify-center hover:text-white">›</button>
    </div>`

  const strip = section.querySelector('.fila-scroll')
  const itemsVisibles = (fila.items || []).slice(0, MAX_ITEMS_CARRUSEL)
  itemsVisibles.forEach((item) => {
    const wrap = document.createElement('div')
    wrap.className = 'carousel-item-wrap w-[140px] sm:w-[160px] md:w-[180px] shrink-0 snap-start'
    wrap.appendChild(crearTarjetaHTML(item))
    strip.appendChild(wrap)
  })

  // Tarjeta "Ver más" al final (para seguir explorando esa categoría/extensión)
  if (fila.ref && (fila.tipo === 'provider' || fila.tipo === 'genero')) {
    const wrapMas = document.createElement('div')
    wrapMas.className = 'carousel-item-wrap w-[140px] sm:w-[160px] md:w-[180px] shrink-0 snap-start'
    const btnMas = document.createElement('button')
    btnMas.className =
      'foco-item w-full aspect-[2/3] rounded-md border border-dashed border-white/20 text-gray-500 hover:text-white hover:border-white/40 hover:bg-white/5 transition flex flex-col items-center justify-center gap-2'
    btnMas.innerHTML =
      '<span class="text-4xl leading-none">+</span><span class="text-xs font-bold">Ver más</span>'
    btnMas.onclick = () => {
      if (fila.tipo === 'provider') {
        marcarNavActiva(null)
        cargarCatalogo(fila.ref, fila.nombre || metaDe(fila.ref).nombre)
      } else {
        cargarCategoria(fila.ref)
      }
    }
    wrapMas.appendChild(btnMas)
    strip.appendChild(wrapMas)
  }

  section.querySelector('.fila-prev').onclick = () =>
    strip.scrollBy({ left: -strip.clientWidth * 0.85, behavior: 'smooth' })
  section.querySelector('.fila-next').onclick = () =>
    strip.scrollBy({ left: strip.clientWidth * 0.85, behavior: 'smooth' })

  return section
}

// Acceso destacado a la TV en vivo (banner clicable en el Inicio)
function crearSeccionTv() {
  const section = document.createElement('section')
  section.className = 'w-full overflow-visible'
  section.innerHTML = `
    <button type="button" class="tv-banner group foco-item">
      <div class="tv-banner__bg"></div>
      <div class="relative flex items-center gap-5 p-6 md:p-8">
        <span class="text-4xl md:text-5xl">📡</span>
        <div class="min-w-0">
          <h3 class="text-xl md:text-2xl font-bold leading-tight">TV en Vivo</h3>
          <p class="text-gray-400 text-sm mt-1">Cientos de canales · Películas y TV abierta</p>
        </div>
        <span class="ml-auto shrink-0 btn-play-white text-sm py-2 px-5">▶ Abrir</span>
      </div>
    </button>`
  section.querySelector('button').onclick = () => abrirTvApp()
  return section
}

// Accesos rápidos a cada extensión (reemplaza la antigua lista lateral)
function crearSeccionExtensiones() {
  const exts = (extensionesLista || []).filter((e) => e.id !== 'tv')
  if (exts.length === 0) return null
  const section = document.createElement('section')
  section.className = 'w-full overflow-visible'
  section.innerHTML = `<h3 class="section-title"><span>🧩</span><span>Extensiones</span></h3>`
  const wrap = document.createElement('div')
  wrap.className = 'extension-strip'
  exts.forEach((ext) => {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'extension-chip foco-item group'
    chip.innerHTML = `
      <span class="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0" style="background:${ext.color}22">${ext.icono || '📺'}</span>
      <span class="truncate">${ext.nombre}</span>`
    chip.onclick = () => {
      marcarNavActiva(null)
      cargarCatalogo(ext.id, ext.nombre)
    }
    wrap.appendChild(chip)
  })
  section.appendChild(wrap)
  return section
}

// ==========================================
// INICIALIZACIÓN Y CATÁLOGO
// ==========================================
async function inicializarApp() {
  const splash = document.getElementById('splash-carga')
  try {
    bibliotecaLocal = await libraryApi.getLibrary()
    if (!bibliotecaLocal.historial) bibliotecaLocal.historial = []
    Tv.bindBiblioteca(bibliotecaLocal)
    await cargarExtensiones()
    await cargarInicio()
  } catch (error) {
    console.error('Error al arrancar:', error)
    mostrarErrorApi('No se pudo iniciar la biblioteca local.')
  } finally {
    await finalizarCargaInicial(splash)
  }
}

async function finalizarCargaInicial(splash) {
  await new Promise((r) => setTimeout(r, 350))
  if (splash) {
    splash.classList.add('splash-out')
    splash.setAttribute('aria-busy', 'false')
    await new Promise((r) => setTimeout(r, 520))
    splash.remove()
  }
  zonaActual = 'MENU'
  modoEdicion = false
  homeFila = 0
  homeCol = 0
  marcarNavActiva(btnInicio)
  const menu = obtenerElementosZonas().MENU
  indicesFoco.MENU = indiceMenuInicio(menu)
  if (menu[indicesFoco.MENU]) enfocarElemento(menu[indicesFoco.MENU])
}

async function cargarExtensiones() {
  try {
    const extensiones = await apiFetch('/providers')
    providersMeta = {}
    extensiones.forEach((ext) => {
      providersMeta[ext.id] = ext
    })
    extensionesLista = extensiones
  } catch (error) {
    console.error('Extensiones no disponibles:', error)
    throw error
  }
}

/** Limpia estado en memoria tras cambiar de servidor API. */
function reiniciarEstadoCatalogo() {
  extensionActual = 'inicio'
  paginaActual = 1
  busquedaActual = ''
  filtrosActuales = {}
  if (inputBuscador) inputBuscador.value = ''
  providersMeta = {}
  extensionesLista = []
  episodiosDelAnimeActual = []
  indiceEpisodioActual = -1
  urlEpisodioJugando = ''
  servidoresActuales = []
  urlAnimeActual = ''
  objetoAnimeActual = null

  if (contenedorFiltros) contenedorFiltros.classList.add('hidden')
  if (contenedorPaginacion) contenedorPaginacion.classList.add('hidden')
  ocultarAtras()

  if (modalDetalles && !modalDetalles.classList.contains('hidden')) {
    modalDetalles.classList.add('hidden')
    limpiarFocoTV()
  }

  while (gridCatalogo.firstChild) gridCatalogo.removeChild(gridCatalogo.firstChild)

  if (Tv.invalidarCache) Tv.invalidarCache()
}

async function manejarApiGuardada(urlNueva, urlAnterior) {
  if (urlNueva !== urlAnterior) {
    reiniciarEstadoCatalogo()
  }

  mostrarToastExito('Configuración guardada correctamente.')

  try {
    await cargarExtensiones()
    await cargarInicio()
  } catch (err) {
    console.warn('Catálogo no recargado tras cambiar API:', err.message)
  }

  irAMenu()
}

// Pantalla de inicio estilo Netflix: filas (carruseles) por categoría
async function cargarInicio() {
  extensionActual = 'inicio'
  paginaActual = 1
  busquedaActual = ''
  inputBuscador.value = ''
  filtrosActuales = {}
  contenedorFiltros.classList.add('hidden')
  tituloSeccion.textContent = '🏠 Inicio'
  tituloSeccion.classList.add('hidden') // en el Inicio el título estorba (van las filas directas)
  ocultarAtras()
  marcarNavActiva(btnInicio)
  if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' })
  await cargarInicioFilas()
}

async function cargarInicioFilas() {
  contenedorPaginacion.classList.add('hidden')
  mostrarSkeletonFilas()
  try {
    const filas = await apiFetch('/home')

    if (!Array.isArray(filas) || filas.length === 0) {
      // Fallback: catálogo unificado plano si el home no trae filas
      return obtenerDatosPaginados()
    }

    aplicarLayoutFilas()
    gridCatalogo.innerHTML = ''

    // 1) Acceso destacado a la TV en vivo (arriba del todo)
    gridCatalogo.appendChild(crearSeccionTv())

    // 2) Accesos rápidos a cada extensión (sustituye a la antigua barra lateral)
    const secExt = crearSeccionExtensiones()
    if (secExt) gridCatalogo.appendChild(secExt)

    // 3) Fila "Continuar viendo" (tu actividad reciente).
    // Excluimos los canales de TV en vivo: no son contenido "para continuar".
    const hist = (bibliotecaLocal.historial || []).filter((h) => h.provider !== 'tv')
    const tieneContinuar = hist.length > 0
    if (tieneContinuar) {
      gridCatalogo.appendChild(
        crearFila({ titulo: '▶ Continuar viendo', tipo: 'historial', items: hist.slice(0, MAX_HISTORIAL_FILA) })
      )
    }

    filas.forEach((fila) => gridCatalogo.appendChild(crearFila(fila)))

    // Nº de secciones fijas que van antes de las filas de contenido:
    // TV (1) + extensiones (0/1) + continuar viendo (0/1)
    const seccionesFijas = 1 + (secExt ? 1 : 0) + (tieneContinuar ? 1 : 0)

    // Fila "Porque viste..." (se inserta de forma asíncrona justo tras las fijas)
    agregarFilaPorqueViste(seccionesFijas)
  } catch (error) {
    console.warn('Inicio con filas falló, usando catálogo plano:', error.message)
    mostrarErrorApi('No se pudo cargar el inicio. Mostrando catálogo alternativo.')
    await obtenerDatosPaginados()
  }
  return undefined
}

// Recomendación basada en lo último que viste.
// En vez de repetir el catálogo de la extensión, usamos el GÉNERO de ese título
// y mezclamos contenido de ese género entre todas las extensiones que lo soporten.
async function agregarFilaPorqueViste(indiceInsercion) {
  const hist = (bibliotecaLocal.historial || []).filter((h) => h.provider !== 'tv')
  const ultimo = hist[0]
  if (!ultimo || !ultimo.provider) return
  try {
    // 1) Averiguar el género del último contenido visto (desde sus detalles).
    let genero = null
    try {
      const det = await apiFetch(
        `/providers/${ultimo.provider}/details?url=${encodeURIComponent(ultimo.url)}`
      )
      if (det && Array.isArray(det.generos) && det.generos.length > 0) {
        // Evitamos géneros poco útiles como "Película"/"Dorama" si aparecieran.
        genero =
          det.generos.find((g) => g && !/pel[ií]cula|dorama|serie/i.test(g)) || det.generos[0]
      }
    } catch (e) {
      console.warn('Género para recomendación no disponible:', e.message)
    }

    let items = []
    let titulo = `Porque viste ${ultimo.titulo}`
    let tipo = 'provider'
    let ref = ultimo.provider

    // 2) Si hay género, traemos contenido de ese género (mezcla de extensiones).
    if (genero) {
      try {
        const data = await apiFetch(`/category?genero=${encodeURIComponent(genero)}`)
        if (Array.isArray(data)) items = data
      } catch (e) {
        console.warn('Categoría para recomendación no disponible:', e.message)
      }
      if (items.length > 0) {
        titulo = `Porque viste ${ultimo.titulo} · ${genero}`
        tipo = 'genero'
        ref = genero
      }
    }

    // 3) Fallback: si no se obtuvo género o no hubo resultados, usamos el catálogo
    //    de la extensión (comportamiento anterior).
    if (items.length === 0) {
      const page = 1 + Math.floor(Math.random() * 3)
      const data = await apiFetch(`/providers/${ultimo.provider}/catalog?page=${page}`)
      items = (Array.isArray(data) ? data : []).map((it) => ({ ...it, provider: ultimo.provider }))
    }

    items = items.filter((it) => it.url !== ultimo.url)
    if (items.length === 0 || extensionActual !== 'inicio') return

    const fila = {
      titulo,
      tipo,
      ref,
      nombre: metaDe(ultimo.provider).nombre,
      items
    }
    const refNode = gridCatalogo.children[indiceInsercion] || null
    gridCatalogo.insertBefore(crearFila(fila), refNode)
  } catch (e) {
    console.warn('Fila "Porque viste" no disponible:', e.message)
  }
}

// Vista de categoría (género) con paginación, mezclando extensiones
async function cargarCategoria(genLabel) {
  extensionActual = `cat:${genLabel}`
  paginaActual = 1
  busquedaActual = ''
  inputBuscador.value = ''
  contenedorFiltros.classList.add('hidden')
  tituloSeccion.textContent = `🎞️ ${genLabel}`
  tituloSeccion.classList.remove('hidden')
  mostrarAtras()
  marcarNavActiva(null)
  if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' })
  await obtenerDatosPaginados()
}

btnInicio.addEventListener('click', cargarInicio)

async function cargarFiltrosDinamicos(idExtension) {
  try {
    const filtros = await apiFetch(`/providers/${idExtension}/filters`)
    contenedorFiltros.innerHTML = ''
    filtrosActuales = {}
    if (filtros.length === 0) {
      contenedorFiltros.classList.add('hidden')
      return
    }

    contenedorFiltros.classList.remove('hidden')
    filtros.forEach((filtro) => {
      const select = document.createElement('select')
      select.className = 'filter-select'
      const optVacia = document.createElement('option')
      optVacia.value = ''
      optVacia.textContent = filtro.nombre
      select.appendChild(optVacia)
      filtro.opciones.forEach((opcion) => {
        if (opcion.valor !== '') {
          const opt = document.createElement('option')
          opt.value = opcion.valor
          opt.textContent = opcion.etiqueta
          select.appendChild(opt)
        }
      })
      select.onchange = (e) => {
        if (e.target.value === '') delete filtrosActuales[filtro.id]
        else filtrosActuales[filtro.id] = e.target.value
        aplicarFiltrosYBuscar()
      }
      contenedorFiltros.appendChild(select)
    })
  } catch (error) {
    contenedorFiltros.classList.add('hidden')
    console.error('Filtros no disponibles:', error.message)
  }
}

async function cargarCatalogo(idExtension, nombreExtension) {
  extensionActual = idExtension
  paginaActual = 1
  busquedaActual = ''
  inputBuscador.value = ''
  const meta = metaDe(idExtension)
  tituloSeccion.textContent = `${meta.icono} ${nombreExtension}`
  tituloSeccion.classList.remove('hidden')
  mostrarAtras()
  if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' })
  await cargarFiltrosDinamicos(idExtension)
  await obtenerDatosPaginados()
}

function aplicarFiltrosYBuscar() {
  paginaActual = 1
  busquedaActual = ''
  inputBuscador.value = ''
  obtenerDatosPaginados()
}

async function obtenerDatosPaginados() {
  const fetchId = ++catalogFetchGen
  const extSnapshot = extensionActual
  const pageSnapshot = paginaActual
  const busqSnapshot = busquedaActual
  mostrarSkeletons()
  contenedorPaginacion.classList.add('hidden')
  try {
    let apiPath = ''
    if (extSnapshot === 'inicio') {
      apiPath = `/catalog?page=${pageSnapshot}`
    } else if (typeof extSnapshot === 'string' && extSnapshot.startsWith('cat:')) {
      const genero = extSnapshot.slice(4)
      apiPath = `/category?genero=${encodeURIComponent(genero)}&page=${pageSnapshot}`
    } else if (busqSnapshot) {
      apiPath = `/providers/${extSnapshot}/search?q=${encodeURIComponent(busqSnapshot)}&page=${pageSnapshot}`
    } else {
      const params = new URLSearchParams(filtrosActuales)
      params.append('page', pageSnapshot)
      apiPath = `/providers/${extSnapshot}/catalog?${params.toString()}`
    }
    const resultados = await apiFetch(apiPath)
    if (fetchId !== catalogFetchGen) return
    if (extensionActual !== extSnapshot || paginaActual !== pageSnapshot || busquedaActual !== busqSnapshot) {
      return
    }
    renderizarTarjetas(resultados)
    textoPagina.textContent = `Página ${paginaActual}`
    btnPaginaAnterior.disabled = paginaActual === 1
    if (resultados.length < 10) {
      btnPaginaSiguiente.disabled = true
      btnPaginaSiguiente.classList.add('opacity-50', 'cursor-not-allowed')
    } else {
      btnPaginaSiguiente.disabled = false
      btnPaginaSiguiente.classList.remove('opacity-50', 'cursor-not-allowed')
    }
    if (resultados.length > 0 || paginaActual > 1) contenedorPaginacion.classList.remove('hidden')
    
    // Resetear scroll y foco al inicio del catálogo
    if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' })
    const gridEls = obtenerElementosZonas().GRID
    if (gridEls && gridEls.length > 0 && !modoEdicion) {
      zonaActual = 'GRID'
      indicesFoco['GRID'] = 0
      enfocarElemento(gridEls[0])
    }
  } catch (error) {
    console.error('Error cargando catálogo:', error)
    gridCatalogo.innerHTML =
      '<p class="state-box col-span-full text-red-400">No se pudo cargar el catálogo. Intenta de nuevo.</p>'
    mostrarErrorApi(error.message || 'Error al cargar el catálogo.')
  }
}

btnPaginaAnterior.addEventListener('click', () => {
  if (paginaActual > 1) {
    paginaActual--
    obtenerDatosPaginados()
  }
})
btnPaginaSiguiente.addEventListener('click', () => {
  paginaActual++
  obtenerDatosPaginados()
})

// ==========================================
// RENDERIZADO VISUAL UNIVERSAL (Caza del Bug)
// ==========================================
function crearTarjetaHTML(item, forceProvider = null) {
  if (!item.provider) item.provider = forceProvider || extensionActual

  const esFavorito = bibliotecaLocal.favoritos.some((fav) => fav.url === item.url)
  const colorEstrella = esFavorito
    ? 'bg-white text-black opacity-100'
    : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
  const meta = metaDe(item.provider)
  const badgeEstado = item.estado
    ? `<span class="absolute bottom-2 left-2 z-20 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/70 text-white/90 backdrop-blur">${item.estado}</span>`
    : ''

  const card = document.createElement('div')
  card.className = 'media-card group foco-item'
  card.setAttribute('data-url', item.url)
  card.innerHTML = `
    <div class="media-card__img-wrap aspect-[2/3]">
      <img src="" alt="${item.titulo}" loading="lazy" decoding="async" class="media-card__img">
      <div class="media-card__overlay">
        <span class="media-card__play">▶</span>
      </div>
      <span class="absolute top-1.5 left-1.5 z-20 w-6 h-6 rounded flex items-center justify-center text-xs shadow-md" style="background:${meta.color}dd" title="${meta.nombre}">${meta.icono}</span>
      ${badgeEstado}
      <button type="button" class="btn-fav absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center text-sm transition z-20 ${colorEstrella}" title="Favorito">✓</button>
    </div>
    <p class="media-card__label">${item.titulo}</p>
  `

  bindPosterImage(card.querySelector('.media-card__img'), item.poster)

  card.onclick = (e) => {
    if (!e.target.closest('.btn-fav')) abrirDetalles(item.url, item.provider)
  }

  const btnFav = card.querySelector('.btn-fav')
  btnFav.onclick = async (e) => {
    e.stopPropagation()
    bibliotecaLocal.favoritos = await libraryApi.toggleFavorite(item)
    actualizarEstrellasVisuales()
  }

  return card
}

// 2. TU RENDERIZAR TARJETAS ORIGINAL (Ahora mucho más limpio y cortito)
function renderizarTarjetas(items) {
  aplicarLayoutGrid()
  while (gridCatalogo.firstChild) gridCatalogo.removeChild(gridCatalogo.firstChild)
  if (items.length === 0) {
    return (gridCatalogo.innerHTML =
      '<p class="state-box col-span-full text-gray-400">No se encontraron resultados.</p>')
  }

  const forceProv = providerCatalogoActivo()
  items.forEach((item) => {
    const card = crearTarjetaHTML(item, forceProv)
    gridCatalogo.appendChild(card)
  })
}
function actualizarEstrellasVisuales() {
  document.querySelectorAll('#grid-catalogo > div').forEach((card) => {
    const urlAttr = card.getAttribute('data-url')
    const esFav = bibliotecaLocal.favoritos.some((fav) => fav.url === urlAttr)
    const btnFav = card.querySelector('.btn-fav')
    if (btnFav)
      btnFav.className = `btn-fav absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center text-sm transition z-20 ${esFav ? 'bg-white text-black opacity-100' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'}`
  })
}

btnFavoritos.addEventListener('click', () => {
  extensionActual = 'favoritos'
  tituloSeccion.textContent = '⭐ Mi Biblioteca'
  tituloSeccion.classList.remove('hidden')
  contenedorFiltros.classList.add('hidden')
  contenedorPaginacion.classList.add('hidden')
  mostrarAtras()
  marcarNavActiva(btnFavoritos)
  // Excluir los canales de TV: tienen su propia sección de favoritos
  renderizarTarjetas(bibliotecaLocal.favoritos.filter((f) => f.provider !== 'tv'))
})

btnHistorial.addEventListener('click', () => {
  extensionActual = 'historial'
  tituloSeccion.textContent = '⏳ Continuar Viendo'
  tituloSeccion.classList.remove('hidden')
  contenedorFiltros.classList.add('hidden')
  contenedorPaginacion.classList.add('hidden')
  mostrarAtras()
  marcarNavActiva(btnHistorial)
  // Excluir canales de TV: tienen su propia sección de "Continuar"
  renderizarTarjetas((bibliotecaLocal.historial || []).filter((h) => h.provider !== 'tv'))
})

// Activar el modo global al hacer clic en el botón azul
btnBusquedaGlobal.addEventListener('click', () => {
  extensionActual = 'global'
  tituloSeccion.textContent = '🌍 Búsqueda Global'
  tituloSeccion.classList.remove('hidden')
  contenedorFiltros.classList.add('hidden')
  contenedorPaginacion.classList.add('hidden')
  mostrarAtras()
  marcarNavActiva(btnBusquedaGlobal)
  gridCatalogo.innerHTML = `
        <div class="col-span-full text-center py-20">
            <span class="text-6xl mb-4 block">🔍</span>
            <h3 class="text-xl text-gray-400 font-bold">Escribe arriba para buscar en todas las extensiones a la vez.</h3>
        </div>
    `
})

// El Buscador Inteligente
async function ejecutarBusquedaDesdeInput() {
  busquedaActual = inputBuscador.value.trim()
  if (!busquedaActual) return

  contenedorFiltros.classList.add('hidden')
  contenedorPaginacion.classList.add('hidden')

  if (extensionActual === 'global' || extensionActual === 'inicio') {
    tituloSeccion.textContent = `🔍 "${busquedaActual}"`
    tituloSeccion.classList.remove('hidden')
    await realizarBusquedaGlobal(busquedaActual)
  } else if (extensionActual) {
    paginaActual = 1
    tituloSeccion.textContent = `Buscando: "${busquedaActual}"`
    await obtenerDatosPaginados()
  }
}

inputBuscador.addEventListener('keydown', async (e) => {
  if (isEnterKey(e)) {
    e.preventDefault()
    e.stopPropagation()
    modoEdicion = false
    await ejecutarBusquedaDesdeInput()
  }
})

inputBuscador.addEventListener('keypress', async (e) => {
  if (isEnterKey(e)) {
    e.preventDefault()
    await ejecutarBusquedaDesdeInput()
  }
})

// Búsqueda global agrupada por extensión (filas estilo Inicio).
async function realizarBusquedaGlobal(query) {
  mostrarSkeletonFilas(3)

  try {
    const resultadosAgrupados = await apiFetch(`/search?q=${encodeURIComponent(query)}`)

    aplicarLayoutFilas()
    gridCatalogo.innerHTML = ''
    let hayResultados = false

    resultadosAgrupados.forEach((grupo) => {
      if (!grupo.resultados || grupo.resultados.length === 0) return
      hayResultados = true
      const meta = metaDe(grupo.id)
      gridCatalogo.appendChild(
        crearFila({
          titulo: `Resultados en ${grupo.nombre}`,
          icono: meta.icono,
          color: meta.color,
          tipo: 'provider',
          ref: grupo.id,
          nombre: grupo.nombre,
          items: grupo.resultados.map((item) => ({ ...item, provider: grupo.id }))
        })
      )
    })

    if (!hayResultados) {
      aplicarLayoutGrid()
      gridCatalogo.innerHTML =
        '<p class="text-gray-400 col-span-full text-center py-10">No se encontró nada en ningún servidor.</p>'
    }
  } catch (error) {
    aplicarLayoutGrid()
    gridCatalogo.innerHTML =
      '<p class="text-red-500 col-span-full text-center py-10">❌ Error ejecutando la búsqueda global.</p>'
  }
}

// ==========================================
// MODAL DE DETALLES CON MEMORIA DE PROVEEDOR
// ==========================================
function ejecutarReproduccionEpisodio(ep, index, tituloSerie) {
  const tituloVideo = tituloReproduccion(ep, index, tituloSerie)
  const progreso = bibliotecaLocal.progreso[ep.url]
  const esPel = esContenidoPelicula(episodiosDelAnimeActual, objetoAnimeActual)

  if (progreso && progreso.visto) {
    document.getElementById('titulo-modal-reanudar').textContent = esPel
      ? 'Ya la viste'
      : 'Capítulo completado'
    document.getElementById('desc-modal-reanudar').innerHTML = esPel
      ? '¿Deseas ver esta película de nuevo?'
      : '¿Deseas ver este capítulo de nuevo?'
    document.getElementById('btn-reanudar-si').textContent = 'Ver de nuevo'
    document.getElementById('btn-reanudar-no').textContent = 'Cancelar'
    document.getElementById('modal-reanudar').classList.remove('hidden')
    enfocarReanudar()
    document.getElementById('btn-reanudar-si').onclick = () => {
      document.getElementById('modal-reanudar').classList.add('hidden')
      forzarReinicio = true
      iniciarReproduccion(ep.url, tituloVideo, index)
    }
    document.getElementById('btn-reanudar-no').onclick = () =>
      document.getElementById('modal-reanudar').classList.add('hidden')
  } else if (progreso && progreso.tiempo > 1) {
    document.getElementById('titulo-modal-reanudar').textContent = 'Continuar viendo'
    document.getElementById('desc-modal-reanudar').innerHTML =
      `Te quedaste en el minuto <span class="text-white font-bold">${formatTime(progreso.tiempo)}</span>.`
    document.getElementById('btn-reanudar-si').textContent = 'Reanudar'
    document.getElementById('btn-reanudar-no').textContent = 'Ver desde el inicio'
    document.getElementById('modal-reanudar').classList.remove('hidden')
    enfocarReanudar()
    document.getElementById('btn-reanudar-si').onclick = () => {
      document.getElementById('modal-reanudar').classList.add('hidden')
      forzarReinicio = false
      iniciarReproduccion(ep.url, tituloVideo, index)
    }
    document.getElementById('btn-reanudar-no').onclick = () => {
      document.getElementById('modal-reanudar').classList.add('hidden')
      forzarReinicio = true
      iniciarReproduccion(ep.url, tituloVideo, index)
    }
  } else {
    forzarReinicio = false
    iniciarReproduccion(ep.url, tituloVideo, index)
  }
}

function configurarBotonPlayPrincipal(detalles, episodios) {
  if (!btnDetallePlay) return
  if (!episodios || episodios.length === 0) {
    btnDetallePlay.classList.add('hidden')
    return
  }
  btnDetallePlay.classList.remove('hidden')

  let mejorIdx = 0
  let etiqueta = 'Reproducir'
  for (let i = 0; i < episodios.length; i++) {
    const p = bibliotecaLocal.progreso[episodios[i].url]
    if (p && !p.visto && p.tiempo > 1) {
      mejorIdx = i
      etiqueta = 'Continuar'
      break
    }
  }
  if (textoDetallePlay) textoDetallePlay.textContent = etiqueta

  btnDetallePlay.onclick = () =>
    ejecutarReproduccionEpisodio(episodios[mejorIdx], mejorIdx, detalles.titulo)
}

async function abrirDetalles(urlPath, providerId = extensionActual) {
  // Sincronizamos la extensión actual con el dueño real de la tarjeta
  extensionActual = providerId
  urlAnimeActual = urlPath

  modalDetalles.classList.remove('hidden')
  detalleTitulo.textContent = 'Cargando...'
  detalleSinopsis.textContent = ''
  listaEpisodios.innerHTML = `
    <div class="detail-loading col-span-full">
      <div class="detail-loading-spinner"></div>
      <p class="text-sm">Extrayendo información...</p>
    </div>`
  detallePoster.src = ''
  if (detalleHeroBg) detalleHeroBg.style.backgroundImage = ''
  if (detalleEpCount) detalleEpCount.classList.add('hidden')
  detalleEstado.classList.add('hidden')
  detalleProvider.classList.add('hidden')
  btnDetalleFav.classList.add('hidden')
  btnDetalleReset.classList.add('hidden')
  if (btnDetallePlay) btnDetallePlay.classList.add('hidden')
  modalDetalles.scrollTop = 0

  try {
    // Hacemos el fetch usando el providerId dedicado de la tarjeta
    const detalles = await apiFetch(
      `/providers/${providerId}/details?url=${encodeURIComponent(urlPath)}`
    )

    episodiosDelAnimeActual = detalles.episodios || []

    const esPel = esContenidoPelicula(episodiosDelAnimeActual, detalles)

    objetoAnimeActual = {
      titulo: detalles.titulo,
      url: urlPath,
      poster: detalles.poster,
      provider: providerId,
      tipo: detalles.tipo || detalles.type || '',
      generos: detalles.generos || [],
      esPelicula: esPel
    }

    detalleTitulo.textContent = detalles.titulo

    // Chip de la extensión de origen
    const metaProv = metaDe(providerId)
    detalleProvider.innerHTML = `${metaProv.icono} ${metaProv.nombre}`
    detalleProvider.classList.remove('hidden')

    // Inyectar Metadatos (Año, Calificación, Géneros)
    if (detalles.año) {
      detalleAño.textContent = detalles.año
      detalleAño.classList.remove('hidden')
    } else {
      detalleAño.classList.add('hidden')
    }

    if (detalles.calificacion) {
      // Limpiamos la calificación por si el backend nos manda texto extra (ej. "IMDb 7.5" -> "7.5")
      const numeroLimpio = detalles.calificacion.replace(/[A-Za-z]/g, '').trim()

      // Le damos el diseño del logo oficial de IMDb (fondo #f5c518, texto negro)
      detalleCalificacion.innerHTML = `
                <span class="bg-[#f5c518] text-black font-extrabold px-1.5 py-0.5 rounded-sm text-xs mr-1 tracking-tighter">IMDb</span> 
                <span class="font-bold text-white">${numeroLimpio}</span>
            `

      // Ajustamos las clases del contenedor para que encaje con el nuevo diseño
      detalleCalificacion.className = 'meta-pill flex items-center'
      detalleCalificacion.classList.remove('hidden')
    } else {
      detalleCalificacion.classList.add('hidden')
    }

    if (detalles.generos && detalles.generos.length > 0) {
      detalleGeneros.textContent = detalles.generos.join(' • ')
      detalleGeneros.classList.remove('hidden')
    } else {
      detalleGeneros.classList.add('hidden')
    } 
    
    // Obtener idiomas en segundo plano
    const detalleIdiomas = document.getElementById('detalle-idiomas');
    if (detalleIdiomas) {
      detalleIdiomas.classList.add('hidden');
      detalleIdiomas.innerHTML = '';
      if (episodiosDelAnimeActual.length > 0) {
         const epPrueba = episodiosDelAnimeActual[0];
         apiFetch(`/providers/${providerId}/watch?url=${encodeURIComponent(epPrueba.url)}`)
           .then(servers => {
             const langs = new Set();
             servers.forEach(srv => {
               const name = (srv.server || srv.nombre || '').toLowerCase();
               
               // Extraer idioma si viene en corchetes ej: [Coreano]
               const matchCorchetes = (srv.server || srv.nombre || '').match(/\[(.*?)\]/);
               if (matchCorchetes) {
                 const langStr = matchCorchetes[1].trim();
                 if (langStr) langs.add(langStr.charAt(0).toUpperCase() + langStr.slice(1));
               } else {
                 if (name.includes('latino') || name.includes('latam')) langs.add('Latino');
                 else if (name.includes('castellano') || name.includes('español') && !name.includes('sub')) langs.add('Español');
                 else if (name.includes('sub') || name.includes('vose')) langs.add('Subtitulado');
               }
             });
             if (langs.size > 0) {
               detalleIdiomas.innerHTML = `<span class="mr-1 text-base">🗣️</span> ${Array.from(langs).join(' • ')}`;
               detalleIdiomas.classList.remove('hidden');
               detalleIdiomas.classList.add('flex');
             }
           })
           .catch(e => console.warn('No se pudieron obtener idiomas', e));
      }
    }

    // 1. Inyectar Estado en el Panel de Detalles con su respectivo color
    if (detalles.estado) {
      detalleEstado.textContent = detalles.estado
      detalleEstado.classList.remove('hidden')

      const est = detalles.estado.toLowerCase()
      detalleEstado.className = 'meta-pill meta-pill--status'
      if (est.includes('emisi')) detalleEstado.classList.add('text-green-400')
      else if (est.includes('finaliz')) detalleEstado.classList.add('text-red-400')
      else if (est.includes('pr[oó]x') || est.includes('proximamente'))
        detalleEstado.classList.add('text-purple-400')
      else detalleEstado.classList.add('text-gray-400')
    }

    // 2. BLOQUEO CRÍTICO: Si está en Próximamente, cancelamos la carga de botones
    const esProximamente = detalles.estado && /pr[oó]x|coming/i.test(detalles.estado)
    if (esProximamente) {
      listaEpisodios.innerHTML = `
        <div class="state-box state-box--purple col-span-full">
          <span class="text-4xl block mb-3">⏳</span>
          <h4 class="text-purple-300 font-bold text-lg mb-2">Contenido no estrenado</h4>
          <p class="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">Este título está marcado como "Próximamente". Los enlaces de reproducción se habilitarán cuando esté disponible.</p>
        </div>`
      requestAnimationFrame(() => {
        zonaActual = 'MODAL'
        indicesFoco.MODAL = 0
        enfocarElemento(document.getElementById('btn-cerrar-modal'))
      })
      return
    }
    detalleSinopsis.textContent = detalles.sinopsis || 'Sin descripción disponible.'
    detallePoster.src = ''
    bindPosterImage(detallePoster, detalles.poster)
    if (detalleHeroBg) {
      const bgImage = detalles.backdrop || detalles.poster
      if (bgImage) detalleHeroBg.style.backgroundImage = `url("${bgImage}")`
    }
    listaEpisodios.innerHTML = ''

    const esFav = bibliotecaLocal.favoritos.some((f) => f.url === urlPath)
    btnDetalleFav.classList.remove('hidden', 'is-active')
    if (esFav) {
      btnDetalleFav.classList.add('is-active')
      iconoFavDetalle.textContent = '✓'
    } else {
      iconoFavDetalle.textContent = '+'
    }

    const tieneProgreso = episodiosDelAnimeActual.some(
      (ep) => bibliotecaLocal.progreso[ep.url] && bibliotecaLocal.progreso[ep.url].tiempo > 1
    )
    if (tieneProgreso) btnDetalleReset.classList.remove('hidden')

    configurarBotonPlayPrincipal(detalles, episodiosDelAnimeActual)

    if (detailEpisodesBlock) detailEpisodesBlock.classList.toggle('hidden', esPel)

    const posterEp = detalles.poster || ''

    const crearBotonEpisodio = (ep, index) => {
      const btnEp = document.createElement('button')
      btnEp.type = 'button'
      const progreso = bibliotecaLocal.progreso[ep.url]

      let statusHtml = ''
      let barHtml = ''
      if (progreso?.visto) {
        statusHtml = '<span class="ep-row__status ep-row__status--watched">Visto ✓</span>'
      } else if (progreso?.tiempo > 1) {
        statusHtml = '<span class="ep-row__status ep-row__status--progress">En curso</span>'
        const pct = porcentajeProgresoEpisodio(progreso, ep)
        if (pct != null) {
          barHtml = `<div class="ep-row__bar-wrap"><div class="ep-row__bar" style="width:${pct}%"></div></div>`
        }
      }

      const tituloMostrar = esPel
        ? ep.nombre || 'Película completa'
        : subtituloEpisodio(ep, index)

      const num = ep.episodio || index + 1
      btnEp.className = 'ep-row'
      btnEp.innerHTML = `
        <span class="ep-row__num">${num}</span>
        <div class="ep-row__thumb">
          <img src="" alt="" loading="lazy" decoding="async">
          <span class="ep-row__thumb-play">▶</span>
        </div>
        <div class="ep-row__body">
          <div class="ep-row__title">${tituloMostrar}</div>
          ${statusHtml}
          ${barHtml}
        </div>`
      bindPosterImage(btnEp.querySelector('.ep-row__thumb img'), posterEp)
      btnEp.onclick = () => ejecutarReproduccionEpisodio(ep, index, detalles.titulo)
      return btnEp
    }

    const tieneTemporadas = episodiosDelAnimeActual.some((ep) => ep.temporada !== undefined)

    if (detalleEpCount) {
      if (!esPel && episodiosDelAnimeActual.length > 0) {
        detalleEpCount.textContent = `${episodiosDelAnimeActual.length} disponibles`
        detalleEpCount.classList.remove('hidden')
      } else {
        detalleEpCount.classList.add('hidden')
      }
    }

    if (!esPel) {
    if (episodiosDelAnimeActual.length === 1 && !tieneTemporadas) {
      listaEpisodios.appendChild(crearBotonEpisodio(episodiosDelAnimeActual[0], 0))
    } else if (!tieneTemporadas) {
      episodiosDelAnimeActual.forEach((ep, i) =>
        listaEpisodios.appendChild(crearBotonEpisodio(ep, i))
      )
    } else {
      const temporadas = {}
      episodiosDelAnimeActual.forEach((ep, i) => {
        ep.indiceOriginal = i
        if (!temporadas[ep.temporada]) temporadas[ep.temporada] = []
        temporadas[ep.temporada].push(ep)
      })
      const contenedorSelect = document.createElement('div')
      contenedorSelect.className = 'season-picker col-span-full'
      contenedorSelect.innerHTML = `<label class="font-bold text-gray-300 text-sm shrink-0">Temporada</label>`
      const selectTemp = document.createElement('select')
      selectTemp.id = 'select-temporada-detalle'
      selectTemp.className = 'filter-select flex-1 foco-item'
      selectTemp.setAttribute('tabindex', '0')
      Object.keys(temporadas)
        .sort((a, b) => a - b)
        .forEach((temp) => {
          const opt = document.createElement('option')
          opt.value = temp
          opt.textContent = `Temporada ${temp}`
          selectTemp.appendChild(opt)
        })
      contenedorSelect.appendChild(selectTemp)
      listaEpisodios.appendChild(contenedorSelect)

      const gridBotones = document.createElement('div')
      gridBotones.className = 'episodes-list'
      listaEpisodios.appendChild(gridBotones)

      const renderizarBotonesTemporada = (numTemporada) => {
        gridBotones.innerHTML = ''
        temporadas[numTemporada].forEach((ep) => {
          gridBotones.appendChild(crearBotonEpisodio(ep, ep.indiceOriginal))
        })
      }
      selectTemp.addEventListener('change', (e) => renderizarBotonesTemporada(e.target.value))
      renderizarBotonesTemporada(Object.keys(temporadas).sort((a, b) => a - b)[0])
    }
    }

    requestAnimationFrame(() => enfocarModalInicial())
  } catch (error) {
    detalleTitulo.textContent = 'Error al cargar'
    listaEpisodios.innerHTML =
      '<p class="state-box col-span-full text-red-400">No se pudo cargar este título. Prueba de nuevo.</p>'
    mostrarErrorApi(error.message || 'Error al cargar los detalles.')
  }
}

btnDetalleFav.addEventListener('click', async () => {
  if (objetoAnimeActual) {
    bibliotecaLocal.favoritos = await libraryApi.toggleFavorite(objetoAnimeActual)
    actualizarEstrellasVisuales()
    abrirDetalles(urlAnimeActual, objetoAnimeActual.provider)
    if (tituloSeccion.textContent === '⭐ Mi Biblioteca')
      renderizarTarjetas(bibliotecaLocal.favoritos.filter((f) => f.provider !== 'tv'))
  }
})

btnDetalleReset.addEventListener('click', async () => {
  const urls = episodiosDelAnimeActual.map((ep) => ep.url).filter(Boolean)
  for (const url of urls) {
    delete bibliotecaLocal.progreso[url]
  }
  const resultado = await libraryApi.clearProgress(objetoAnimeActual, urls)
  bibliotecaLocal.historial = resultado.historial
  bibliotecaLocal.progreso = resultado.progreso
  abrirDetalles(urlAnimeActual, objetoAnimeActual.provider)
  if (tituloSeccion.textContent === '⏳ Continuar Viendo')
    renderizarTarjetas((bibliotecaLocal.historial || []).filter((h) => h.provider !== 'tv'))
})

function cerrarModalDetalles() {
  modalDetalles.classList.add('hidden')
  limpiarFocoTV()
  modoEdicion = false
  zonaActual = 'GRID'
  const els = obtenerElementosZonas().GRID
  if (els[indicesFoco.GRID]) enfocarElemento(els[indicesFoco.GRID])
  else entrarEnContenido()
}

modalDetalles.addEventListener('click', (e) => {
  if (e.target === modalDetalles) cerrarModalDetalles()
})
btnCerrarModal.addEventListener('click', cerrarModalDetalles)

const modalReanudar = document.getElementById('modal-reanudar')
modalReanudar.addEventListener('click', (e) => {
  if (e.target === modalReanudar) modalReanudar.classList.add('hidden')
})
// Botones de cerrar/cancelar el modal de reanudar
document
  .getElementById('btn-reanudar-cerrar')
  .addEventListener('click', () => modalReanudar.classList.add('hidden'))
document
  .getElementById('btn-reanudar-cancelar')
  .addEventListener('click', () => modalReanudar.classList.add('hidden'))

// Índice del foco por teclado dentro del modal de reanudar
let idxReanudar = 0
function opcionesReanudar() {
  return [
    document.getElementById('btn-reanudar-si'),
    document.getElementById('btn-reanudar-no'),
    document.getElementById('btn-reanudar-cancelar')
  ].filter(Boolean)
}
// Coloca el foco inicial al abrir el modal (se llama tras mostrarlo)
function enfocarReanudar() {
  idxReanudar = 0
  setTimeout(() => {
    const ops = opcionesReanudar()
    if (ops[0]) enfocarElemento(ops[0])
  }, 60)
}

// --- SISTEMA DE NAVEGACIÓN ESPACIAL POR ZONAS (TV / GAMEPAD) ---

let zonaActual = 'MENU'
let indicesFoco = { MENU: 0, TOP: 0, GRID: 0, PAGINACION: 0, MODAL: 0 }
let modoEdicion = false
let homeFila = 0
let homeCol = 0
let modalFila = 0
let modalCol = 0

const esVisibleTV = (el) =>
  !!el && (el.offsetParent !== null || getComputedStyle(el).display !== 'none')

function indiceMenuInicio(menu = obtenerElementosZonas().MENU) {
  const i = menu.indexOf(btnInicio)
  return i >= 0 ? i : 0
}

function irAMenu() {
  zonaActual = 'MENU'
  const menu = obtenerElementosZonas().MENU
  indicesFoco.MENU = indiceMenuInicio(menu)
  marcarNavActiva(btnInicio)
  if (menu[indicesFoco.MENU]) enfocarElemento(menu[indicesFoco.MENU])
  if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' })
}

// Elementos enfocables dentro de una sección del Inicio (carrusel, chips, banner TV).
function itemsEnFilaHome(sec) {
  const strip = sec.querySelector('.fila-scroll')
  if (strip) {
    return Array.from(
      strip.querySelectorAll(':scope > div > .media-card, :scope > div > .group, :scope > div > .foco-item, :scope > div > button')
    ).filter(esVisibleTV)
  }
  const chips = sec.querySelector('.extension-strip, .flex-wrap')
  if (chips) return Array.from(chips.querySelectorAll('button')).filter(esVisibleTV)
  const banner = sec.querySelector(':scope > button')
  if (banner) return [banner].filter(esVisibleTV)
  return []
}

// Devuelve las filas (carruseles) del Inicio como matriz de elementos enfocables.
function filasHome() {
  return Array.from(gridCatalogo.querySelectorAll(':scope > section'))
    .map(itemsEnFilaHome)
    .filter((fila) => fila.length > 0)
}

function gridModal() {
  const filas = []
  const visible = (el) => el && esVisibleTV(el)
  
  const btnCerrar = document.getElementById('btn-cerrar-modal')
  if (visible(btnCerrar)) filas.push([btnCerrar])
  
  const toolbar = [
    btnDetallePlay,
    btnDetalleFav,
    btnDetalleReset
  ].filter(visible)
  if (toolbar.length) filas.push(toolbar)
  
  const sel = document.querySelector('#lista-episodios select')
  if (visible(sel)) filas.push([sel])
  
  document.querySelectorAll('#lista-episodios .ep-row, #lista-episodios .player-ep-item').forEach((ep) => {
    if (visible(ep)) filas.push([ep])
  })
  return filas
}

function obtenerElementosModal() {
  return gridModal().flat()
}

function obtenerElementosZonas() {
  const esGridFilas = gridCatalogo.classList.contains('flex')
  return {
    MENU: Array.from(document.querySelectorAll('#top-nav button, #top-nav input')).filter(
      esVisibleTV
    ),
    TOP: Array.from(document.querySelectorAll('#contenedor-filtros select')).filter(esVisibleTV),
    GRID: esGridFilas
      ? []
      : Array.from(gridCatalogo.children).filter(
          (el) =>
            esVisibleTV(el) &&
            (el.classList.contains('media-card') ||
              el.classList.contains('group') ||
              el.tagName === 'A')
        ),
    PAGINACION: Array.from(
      document.querySelectorAll('#contenedor-paginacion button:not([disabled])')
    ).filter(esVisibleTV),
    MODAL: obtenerElementosModal()
  }
}

function enfocarModalInicial() {
  zonaActual = 'MODAL'
  modoEdicion = false
  const grid = gridModal()
  if (!grid.length) return
  
  let found = false
  for (let f = 0; f < grid.length; f++) {
    const c = grid[f].indexOf(btnDetallePlay)
    if (c !== -1) {
      modalFila = f
      modalCol = c
      found = true
      break
    }
  }
  
  if (!found) {
    modalFila = 0
    modalCol = 0
  }
  
  const el = grid[modalFila][modalCol]
  if (el) enfocarElemento(el)
}

// Entra a la zona de contenido enfocando el primer elemento (rejilla o filas)
function entrarEnContenido() {
  zonaActual = 'GRID'
  if (gridCatalogo.classList.contains('flex')) {
    const filas = filasHome()
    homeFila = 0
    homeCol = 0
    if (filas[0] && filas[0][0]) enfocarElemento(filas[0][0])
  } else {
    const els = obtenerElementosZonas().GRID
    indicesFoco.GRID = 0
    if (els[0]) enfocarElemento(els[0])
  }
}

function limpiarFocoTV() {
  document.querySelectorAll('.foco-tv').forEach((el) => {
    el.classList.remove('foco-tv', 'foco-nav', 'foco-edicion', 'foco-player')
  })
}

let uiReproductor = false
let playerFila = 0
let playerCol = 0
let idxEpOverlay = 0

function navegablesOverlay() {
  const cerrarBtn = document.getElementById('player-ep-cerrar')
  const epEls = elementosOverlayEpisodios()
  return cerrarBtn ? [cerrarBtn, ...epEls] : epEls
}

function celdaReproductor(id) {
  const el = document.getElementById(id)
  if (!el || el.classList.contains('hidden')) return null
  if (!esVisibleTV(el)) return null
  return el
}

function gridReproductor() {
  const filas = []
  const filaSuperior = [
    celdaReproductor('btn-cerrar-reproductor'),
    celdaReproductor('selector-servidor')
  ].filter(Boolean)
  if (filaSuperior.length) filas.push(filaSuperior)

  const barra = celdaReproductor('progress-bar')
  if (barra) filas.push([barra])

  const filaControles = [
    celdaReproductor('btn-prev-ep'),
    celdaReproductor('btn-play-pause'),
    celdaReproductor('btn-next-ep'),
    celdaReproductor('btn-ep-lista'),
    celdaReproductor('btn-fullscreen')
  ].filter(Boolean)
  if (filaControles.length) filas.push(filaControles)

  return filas
}

function entrarUiReproductor() {
  uiReproductor = true
  if (Player.mostrarControles) Player.mostrarControles(true)
  const grid = gridReproductor()
  if (!grid.length) return
  playerFila = grid.length - 1
  const fila = grid[playerFila]
  const playIdx = fila.findIndex((el) => el.id === 'btn-play-pause')
  playerCol = playIdx >= 0 ? playIdx : 0
  enfocarElemento(fila[playerCol])
}

function salirUiReproductor() {
  uiReproductor = false
  limpiarFocoTV()
}

function elementosOverlayEpisodios() {
  return Array.from(document.querySelectorAll('#player-ep-lista .player-ep-item')).filter(esVisibleTV)
}

function overlayEpisodiosEstaVisible() {
  return Player.overlayEpisodiosVisible?.() ?? false
}

function enfocarElemento(elemento) {
  if (!elemento) return
  limpiarFocoTV()

  elemento.classList.add('foco-tv')
  if (modoEdicion) elemento.classList.add('foco-edicion')
  if (elemento.closest('#top-nav')) {
    elemento.classList.add('foco-nav')
    if (elemento.classList.contains('nav-item')) marcarNavActiva(elemento)
    else if (elemento.id === 'btn-busqueda-global') marcarNavActiva(elemento)
  }
  if (elemento.closest('#modal-reproductor')) elemento.classList.add('foco-player')

  const enNav = !!elemento.closest('#top-nav')
  const enCarrusel = !!elemento.closest('.media-card, .carousel-row')
  const modalScroll = elemento.closest('#modal-detalles')
  if (modalScroll) {
    const rect = elemento.getBoundingClientRect()
    const modalRect = modalScroll.getBoundingClientRect()
    const margen = 48
    if (rect.bottom > modalRect.bottom - margen) {
      modalScroll.scrollTop += rect.bottom - modalRect.bottom + margen
    } else if (rect.top < modalRect.top + margen) {
      modalScroll.scrollTop -= modalRect.top - rect.top + margen
    }
  } else {
    elemento.scrollIntoView({
      behavior: 'smooth',
      block: enCarrusel ? 'nearest' : enNav ? 'nearest' : 'center',
      inline: 'center'
    })
  }
  const strip = elemento.closest('.fila-scroll')
  if (strip) {
    const card = elemento.classList.contains('media-card') ? elemento : elemento.closest('.media-card')
    const target = card || elemento
    const wrap = target.parentElement
    if (wrap) {
      const left = wrap.offsetLeft - strip.clientWidth / 2 + wrap.offsetWidth / 2
      strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
    }
  }
  if (elemento.tagName !== 'INPUT' || modoEdicion) {
    if (elemento.tagName === 'SELECT' || elemento.type === 'range') {
      elemento.focus({ preventScroll: true })
    } else {
      elemento.focus({ preventScroll: true })
    }
  }
}

window.addEventListener('keydown', (e) => {
  const modalAjustesEl = document.getElementById('modal-ajustes')
  if (modalAjustesEl && !modalAjustesEl.classList.contains('hidden')) return

  const modalReproductor = document.getElementById('modal-reproductor')

  // --- 🎬 MODO REPRODUCTOR DE VIDEO (Pantalla Completa) ---
  if (!modalReproductor.classList.contains('hidden')) {
    if (isBackKey(e)) {
      if (overlayEpisodiosEstaVisible()) {
        Player.cerrarOverlayEpisodios?.()
        e.preventDefault()
        return
      }
      document.getElementById('btn-cerrar-reproductor').click()
      e.preventDefault()
      return
    }

    const videoNative = document.getElementById('video-player')
    const iframePlayer = document.getElementById('iframe-player')
    const esIframe = iframePlayer && !iframePlayer.classList.contains('hidden')
    const esNativo = videoNative && !videoNative.classList.contains('hidden')

    if (overlayEpisodiosEstaVisible()) {
      if (e.key === 'ArrowLeft') {
        Player.cerrarOverlayEpisodios?.()
        e.preventDefault()
        return
      }
      const navegables = navegablesOverlay()
      if (navegables.length > 0) {
        if (e.repeat && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault()
          return
        }
        if (e.key === 'ArrowDown') idxEpOverlay = Math.min(idxEpOverlay + 1, navegables.length - 1)
        else if (e.key === 'ArrowUp') idxEpOverlay = Math.max(idxEpOverlay - 1, 0)
        else if (isEnterKey(e)) {
          navegables[idxEpOverlay]?.click()
          e.preventDefault()
          return
        } else if (!['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
          return
        }
        if (navegables[idxEpOverlay]) enfocarElemento(navegables[idxEpOverlay])
        e.preventDefault()
        return
      }
      e.preventDefault()
      return
    }

    if (esNativo) {
      if (!uiReproductor) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          if (e.repeat) {
            e.preventDefault()
            return
          }
          if (Player.mostrarControles) Player.mostrarControles(true)
          limpiarFocoTV()
          const salto = e.key === 'ArrowRight' ? 10 : -10
          videoNative.currentTime = Math.max(
            0,
            Math.min(videoNative.duration || 0, videoNative.currentTime + salto)
          )
          e.preventDefault()
          return
        }
        if (e.key === 'ArrowDown') {
          entrarUiReproductor()
          e.preventDefault()
          return
        }
        if (e.key === ' ' || e.code === 'Space') {
          document.getElementById('btn-play-pause')?.click()
          e.preventDefault()
          return
        }
      } else {
        const grid = gridReproductor()
        if (grid.length === 0) return

        if (e.repeat && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault()
          return
        }

        if (e.key === 'ArrowUp') {
          if (playerFila > 0) playerFila--
          else {
            salirUiReproductor()
            if (Player.mostrarControles) Player.mostrarControles(true)
            e.preventDefault()
            return
          }
        } else if (e.key === 'ArrowDown') {
          playerFila = Math.min(playerFila + 1, grid.length - 1)
        } else if (e.key === 'ArrowLeft') {
          playerCol = Math.max(0, playerCol - 1)
        } else if (e.key === 'ArrowRight') {
          const fila = grid[playerFila]
          playerCol = Math.min(playerCol + 1, fila.length - 1)
        } else if (isEnterKey(e)) {
          const celda = grid[playerFila]?.[playerCol]
          if (celda?.tagName === 'INPUT' && celda.type === 'range') return
          if (celda?.id === 'btn-ep-lista' && overlayEpisodiosEstaVisible()) {
            Player.cerrarOverlayEpisodios?.()
          } else {
            celda?.click()
          }
          e.preventDefault()
          return
        } else if (e.key === ' ' || e.code === 'Space') {
          const celda = grid[playerFila]?.[playerCol]
          if (celda?.id !== 'progress-bar') {
            document.getElementById('btn-play-pause')?.click()
          }
          e.preventDefault()
          return
        } else {
          return
        }

        const filaActiva = grid[playerFila]
        if (filaActiva) {
          playerCol = Math.min(playerCol, filaActiva.length - 1)
          enfocarElemento(filaActiva[playerCol])
          if (Player.mostrarControles) Player.mostrarControles(true)
        }
        e.preventDefault()
        return
      }
    }

    if (!esIframe && isSelectKey(e)) {
      const grid = gridReproductor()
      const celda = uiReproductor ? grid[playerFila]?.[playerCol] : null
      if (celda) celda.click()
      e.preventDefault()
    }

    return
  }

  // --- MODAL "REANUDAR / CONTINUAR VIENDO" (tiene prioridad) ---
  const modalReanudarEl = document.getElementById('modal-reanudar')
  if (modalReanudarEl && !modalReanudarEl.classList.contains('hidden')) {
    const ops = opcionesReanudar()
    if (isBackKey(e)) {
      modalReanudarEl.classList.add('hidden')
      limpiarFocoTV()
      e.preventDefault()
      return
    }
    if (idxReanudar < 0) idxReanudar = 0
    if (idxReanudar >= ops.length) idxReanudar = ops.length - 1
    if (e.key === 'ArrowDown') {
      idxReanudar = Math.min(idxReanudar + 1, ops.length - 1)
    } else if (e.key === 'ArrowUp') {
      idxReanudar = Math.max(idxReanudar - 1, 0)
    } else if (isEnterKey(e)) {
      if (ops[idxReanudar]) ops[idxReanudar].click()
      e.preventDefault()
      return
    }
    if (ops[idxReanudar]) enfocarElemento(ops[idxReanudar])
    e.preventDefault()
    return
  }

  // --- A PARTIR DE AQUÍ SIGUE LA NAVEGACIÓN DE LA INTERFAZ NORMAL ---
  if (e.target && e.target.tagName === 'INPUT' && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'GoBack', 'OK'].includes(e.key) && !isBackKey(e) && !isEnterKey(e)) {
    return // Permitir escribir de forma nativa si un input tiene el foco (ej: mouse click)
  }

  const teclasFlecha = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
  if (e.repeat && teclasFlecha.includes(e.key)) {
    e.preventDefault()
    return
  }

  const modalAbierto = !document.getElementById('modal-detalles').classList.contains('hidden')
  if (modalAbierto && zonaActual !== 'MODAL') {
    zonaActual = 'MODAL'
    modoEdicion = false
  }
  if (!modalAbierto && zonaActual === 'MODAL') {
    zonaActual = 'GRID'
    modoEdicion = false
  }

  // ESC: volver al Inicio si estamos en cualquier otra vista (no en modal)
  if (
    !modalAbierto &&
    isBackKey(e) &&
    typeof extensionActual === 'string' &&
    extensionActual !== 'inicio'
  ) {
    cargarInicio()
    e.preventDefault()
    setTimeout(() => irAMenu(), 150)
    return
  }

  const elementos = obtenerElementosZonas()

  // --- MODO EDICIÓN (escribir en el buscador) ---
  if (modoEdicion) {
    const elEd = (elementos[zonaActual] || [])[indicesFoco[zonaActual]]
    if (isBackKey(e)) {
      modoEdicion = false
      enfocarElemento(elEd)
      e.preventDefault()
      return
    }
    if (isEnterKey(e)) {
      modoEdicion = false
      if (elEd && elEd.id === 'input-buscador') {
        ejecutarBusquedaDesdeInput()
      } else {
        enfocarElemento(elEd)
      }
      e.preventDefault()
      return
    }
    if (elEd && elEd.tagName === 'INPUT') {
      if (e.key === 'ArrowDown') {
        modoEdicion = false
        entrarEnContenido()
        e.preventDefault()
      }
      return // dejar escribir normalmente
    }
  }

  // --- ZONA: GRID EN MODO FILAS (Inicio / carruseles) ---
  if (zonaActual === 'GRID' && gridCatalogo.classList.contains('flex')) {
    const filas = filasHome()
    if (filas.length === 0) {
      irAMenu()
      e.preventDefault()
      return
    }
    homeFila = Math.max(0, Math.min(homeFila, filas.length - 1))
    homeCol = Math.max(0, Math.min(homeCol, filas[homeFila].length - 1))

    if (e.key === 'ArrowRight') {
      homeCol = Math.min(homeCol + 1, filas[homeFila].length - 1)
    } else if (e.key === 'ArrowLeft') {
      homeCol = Math.max(0, homeCol - 1)
    } else if (e.key === 'ArrowDown') {
      if (homeFila < filas.length - 1) {
        homeFila++
        homeCol = Math.min(homeCol, filas[homeFila].length - 1)
      }
    } else if (e.key === 'ArrowUp') {
      if (homeFila === 0) {
        irAMenu()
        e.preventDefault()
        return
      }
      homeFila--
      homeCol = Math.min(homeCol, filas[homeFila].length - 1)
    } else if (isEnterKey(e)) {
      const el = filas[homeFila][homeCol]
      if (el) el.click()
      e.preventDefault()
      return
    }
    enfocarElemento(filas[homeFila][homeCol])
    e.preventDefault()
    return
  }

  let els = zonaActual === 'MODAL' ? obtenerElementosModal() : elementos[zonaActual]
  if (!els || els.length === 0) {
    zonaActual = 'MENU'
    return
  }

  let idx = indicesFoco[zonaActual]
  if (idx < 0) idx = 0
  if (idx >= els.length) idx = els.length - 1
  const elActual = els[idx]

  // --- ZONA: BARRA SUPERIOR (nav: inicio, fav, buscador, etc.) ---
  if (zonaActual === 'MENU') {
    if (isEnterKey(e)) {
      if (elActual.tagName === 'INPUT') {
        modoEdicion = true
        enfocarElemento(elActual)
        return
      }
      elActual.click()
    } else if (e.key === 'ArrowRight') {
      if (idx >= els.length - 1) {
        if (elementos.TOP.length > 0) {
          zonaActual = 'TOP'
          idx = 0
        }
      } else idx++
    } else if (e.key === 'ArrowLeft') {
      idx = Math.max(0, idx - 1)
    } else if (e.key === 'ArrowDown') {
      if (elementos.TOP.length > 0) {
        zonaActual = 'TOP'
        idx = 0
      } else {
        entrarEnContenido()
        e.preventDefault()
        return
      }
    } else if (e.key === 'ArrowUp') {
      if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' })
      e.preventDefault()
      return
    }
  }

  // --- ZONA: FILTROS (selects bajo la barra) ---
  else if (zonaActual === 'TOP') {
    if (isEnterKey(e)) {
      if (elActual.tagName === 'SELECT') {
        try {
          elActual.showPicker()
        } catch (err) {}
        return
      }
      elActual.click()
    } else if (e.key === 'ArrowRight') {
      idx = Math.min(idx + 1, els.length - 1)
    } else if (e.key === 'ArrowLeft') {
      if (idx === 0) {
        zonaActual = 'MENU'
        idx = elementos.MENU.length - 1
      } else idx--
    } else if (e.key === 'ArrowDown') {
      entrarEnContenido()
      e.preventDefault()
      return
    } else if (e.key === 'ArrowUp') {
      zonaActual = 'MENU'
      idx = elementos.MENU.length - 1
    }
  }

  // --- ZONA: CATÁLOGO EN REJILLA (extensiones / categorías) ---
  else if (zonaActual === 'GRID') {
    const gridStyle = getComputedStyle(gridCatalogo).gridTemplateColumns
    const columnasGrid = gridStyle ? gridStyle.split(' ').filter(Boolean).length : 5

    if (e.key === 'ArrowLeft') {
      if (idx % columnasGrid === 0) {
        irAMenu()
        e.preventDefault()
        return
      }
      idx--
    } else if (e.key === 'ArrowRight') idx = Math.min(idx + 1, els.length - 1)
    else if (e.key === 'ArrowUp') {
      if (idx < columnasGrid) {
        if (elementos.TOP.length > 0) {
          zonaActual = 'TOP'
          idx = 0
        } else {
          irAMenu()
          e.preventDefault()
          return
        }
      } else idx -= columnasGrid
    } else if (e.key === 'ArrowDown') {
      if (idx + columnasGrid >= els.length) {
        if (elementos.PAGINACION.length > 0) {
          zonaActual = 'PAGINACION'
          idx = 0
        }
      } else {
        idx += columnasGrid
      }
    } else if (isEnterKey(e)) els[idx].click()
  }

  // --- ZONA: PAGINACIÓN ---
  else if (zonaActual === 'PAGINACION') {
    if (e.key === 'ArrowRight') idx = Math.min(idx + 1, els.length - 1)
    else if (e.key === 'ArrowLeft') {
      if (idx === 0) zonaActual = 'GRID'
      else idx--
    } else if (e.key === 'ArrowUp') {
      zonaActual = 'GRID'
      idx = elementos.GRID.length - 1
    } else if (isEnterKey(e)) els[idx].click()
  }

  // --- ZONA: MODAL DE DETALLES ---
  else if (zonaActual === 'MODAL') {
    const grid = gridModal()
    if (grid.length === 0) {
      e.preventDefault()
      return
    }
    modalFila = Math.max(0, Math.min(modalFila, grid.length - 1))
    modalCol = Math.max(0, Math.min(modalCol, grid[modalFila].length - 1))

    if (e.key === 'ArrowRight') {
      modalCol = Math.min(modalCol + 1, grid[modalFila].length - 1)
    } else if (e.key === 'ArrowLeft') {
      modalCol = Math.max(0, modalCol - 1)
    } else if (e.key === 'ArrowDown') {
      if (modalFila < grid.length - 1) {
        modalFila++
        modalCol = Math.min(modalCol, grid[modalFila].length - 1)
      }
    } else if (e.key === 'ArrowUp') {
      if (modalFila > 0) {
        modalFila--
        modalCol = Math.min(modalCol, grid[modalFila].length - 1)
      }
    } else if (isEnterKey(e)) {
      const target = grid[modalFila][modalCol]
      if (target?.tagName === 'SELECT') {
        modoEdicion = true
        try {
          target.showPicker()
        } catch (err) {
          target.focus()
        }
        enfocarElemento(target)
        e.preventDefault()
        return
      }
      target?.click()
      e.preventDefault()
      return
    } else if (isBackKey(e)) {
      cerrarModalDetalles()
      e.preventDefault()
      return
    } else {
      return
    }

    enfocarElemento(grid[modalFila][modalCol])
    e.preventDefault()
    return
  }

  e.preventDefault()

  const nuevaZonaEls =
    zonaActual === 'MODAL' ? obtenerElementosModal() : elementos[zonaActual]
  if (nuevaZonaEls && nuevaZonaEls.length > 0) {
    if (idx < 0) idx = 0
    if (idx >= nuevaZonaEls.length) idx = nuevaZonaEls.length - 1
    indicesFoco[zonaActual] = idx
    enfocarElemento(nuevaZonaEls[idx])
  }
})

// Barra superior: se vuelve sólida al hacer scroll (efecto Netflix)
if (mainScroll && topNav) {
  mainScroll.addEventListener('scroll', () => {
    topNav.classList.toggle('nav-solid', mainScroll.scrollTop > 20)
  })
}

// Resetear el foco del teclado si el usuario decide usar el mouse
window.addEventListener('mousemove', () => {
  // Opcional: puedes descomentar la siguiente línea si quieres que el mouse limpie la selección del control
  // limpiarFocoTarjetas();
})

function getPlayerCtx() {
  return {
    get extensionActual() {
      return extensionActual
    },
    set extensionActual(v) {
      extensionActual = v
    },
    bibliotecaLocal,
    get objetoAnimeActual() {
      return objetoAnimeActual
    },
    set objetoAnimeActual(v) {
      objetoAnimeActual = v
    },
    get urlEpisodioJugando() {
      return urlEpisodioJugando
    },
    set urlEpisodioJugando(v) {
      urlEpisodioJugando = v
    },
    get episodiosDelAnimeActual() {
      return episodiosDelAnimeActual
    },
    set episodiosDelAnimeActual(v) {
      episodiosDelAnimeActual = v
    },
    get indiceEpisodioActual() {
      return indiceEpisodioActual
    },
    set indiceEpisodioActual(v) {
      indiceEpisodioActual = v
    },
    get forzarReinicio() {
      return forzarReinicio
    },
    set forzarReinicio(v) {
      forzarReinicio = v
    },
    get urlAnimeActual() {
      return urlAnimeActual
    },
    set urlAnimeActual(v) {
      urlAnimeActual = v
    },
    get streamHandle() {
      return streamHandle
    },
    set streamHandle(v) {
      streamHandle = v
    },
    get servidoresActuales() {
      return servidoresActuales
    },
    set servidoresActuales(v) {
      servidoresActuales = v
    },
    abrirDetalles
  }
}

function esPeliculaCtx() {
  return Boolean(objetoAnimeActual?.esPelicula)
}

setPlayerContextFactory(function () {
  const ctx = getPlayerCtx()
  ctx.tituloParaEpisodio = (ep, index) =>
    tituloReproduccion(ep, index, objetoAnimeActual?.titulo)
  ctx.subtituloEpisodio = subtituloEpisodio
  ctx.esPelicula = esPeliculaCtx
  return ctx
})

window.addEventListener('nexus:player-abierto', () => {
  uiReproductor = false
  playerFila = 0
  playerCol = 0
  limpiarFocoTV()
  if (Player.mostrarControles) Player.mostrarControles(true)
})

window.addEventListener('nexus:player-controles-ocultos', () => {
  uiReproductor = false
  limpiarFocoTV()
})

window.addEventListener('nexus:player-ep-overlay', (e) => {
  if (e.detail?.abierto) {
    const nav = navegablesOverlay()
    const epActivo = nav.find((el) => el.classList.contains('player-ep-item--active'))
    idxEpOverlay = Math.max(0, nav.indexOf(epActivo || nav[0]))
    if (nav[idxEpOverlay]) enfocarElemento(nav[idxEpOverlay])
  } else {
    limpiarFocoTV()
    if (uiReproductor) {
      const grid = gridReproductor()
      const fila = grid[playerFila]
      if (fila?.[playerCol]) enfocarElemento(fila[playerCol])
    }
  }
})

initSettingsModule({ onGuardado: manejarApiGuardada })

inicializarApp()
