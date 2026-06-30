const ProviderBase = require('./ProviderBase')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const config = require('../config/env')

// ==========================================
// EXTENSIÓN: TV EN VIVO (IPTV / estilo Smarters)
// Reemplaza al server.js de "xtream code": en lugar de exponer endpoints
// Xtream Codes, se integra como una extensión más de NexusMedia. Descarga
// listas M3U públicas, las cachea y las sirve usando el mismo contrato que
// el resto de extensiones (catálogo / búsqueda / detalles / enlaces).
// ==========================================

// Mismas fuentes que usaba validador.js del proyecto de TV
const FUENTES = [
  { nombre: '🇪🇨 Ecuador', url: 'https://iptv-org.github.io/iptv/countries/ec.m3u' },
  { nombre: '🇨🇴 Colombia', url: 'https://iptv-org.github.io/iptv/countries/co.m3u' },
  { nombre: '🇲🇽 México', url: 'https://iptv-org.github.io/iptv/countries/mx.m3u' },
  { nombre: '🇦🇷 Argentina', url: 'https://iptv-org.github.io/iptv/countries/ar.m3u' },
  { nombre: '🇵🇪 Perú', url: 'https://iptv-org.github.io/iptv/countries/pe.m3u' },
  { nombre: '🇨🇱 Chile', url: 'https://iptv-org.github.io/iptv/countries/cl.m3u' },
  { nombre: '🇻🇪 Venezuela', url: 'https://iptv-org.github.io/iptv/countries/ve.m3u' },
  { nombre: '🇧🇷 Brasil', url: 'https://iptv-org.github.io/iptv/countries/br.m3u' },
  { nombre: '🇺🇾 Uruguay', url: 'https://iptv-org.github.io/iptv/countries/uy.m3u' },
  { nombre: '🇵🇾 Paraguay', url: 'https://iptv-org.github.io/iptv/countries/py.m3u' },
  { nombre: '🇨🇷 Costa Rica', url: 'https://iptv-org.github.io/iptv/countries/cr.m3u' },
  { nombre: '🇸🇻 El Salvador', url: 'https://iptv-org.github.io/iptv/countries/sv.m3u' },
  { nombre: '🇬🇹 Guatemala', url: 'https://iptv-org.github.io/iptv/countries/gt.m3u' },
  { nombre: '🇭🇳 Honduras', url: 'https://iptv-org.github.io/iptv/countries/hn.m3u' },
  { nombre: '🇪🇸 España', url: 'https://iptv-org.github.io/iptv/countries/es.m3u' }
]

const CACHE_FILE = path.join(config.dataDir, 'tv_cache.json')
const CACHE_TTL = config.tvCacheTtlMs

try {
  fs.mkdirSync(config.dataDir, { recursive: true })
} catch (_) {
  /* directorio opcional */
}
const PAGE_SIZE = 36

class TvEnVivo extends ProviderBase {
  constructor() {
    super()
    this.id = 'tv'
    this.nombre = 'TV en Vivo'
    this.icono = '📡'
    this.color = '#0ea5e9'

    this.canales = [] // catálogo completo en memoria
    this._cargando = null // promesa de carga en curso (evita descargas duplicadas)

    // Precargamos en segundo plano para que la lista esté lista al abrir la app.
    this.cargar().catch(() => {})
  }

  // ---------- PARSER M3U (sin dependencias externas) ----------
  _parsearM3U(raw, origen) {
    const lineas = raw.split(/\r?\n/)
    const items = []
    let actual = null

    for (const linea of lineas) {
      const l = linea.trim()
      if (l.startsWith('#EXTINF')) {
        const logo = (l.match(/tvg-logo="([^"]*)"/) || [])[1] || ''
        const grupo = (l.match(/group-title="([^"]*)"/) || [])[1] || 'General'
        const nombre = (l.split(',').pop() || '').trim() || 'Canal sin nombre'
        actual = { nombre, logo, grupo, origen }
      } else if (l && !l.startsWith('#')) {
        if (actual) {
          actual.url = l
          items.push(actual)
          actual = null
        }
      }
    }
    return items
  }

  // Hash estable a partir de la URL del stream: el id de un canal no cambia
  // entre recargas, así los favoritos siguen apuntando al canal correcto.
  _hash(str) {
    let h = 5381
    for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i)
    return (h >>> 0).toString(36)
  }

  // Clasifica un canal en live / movie / series según su grupo o nombre.
  _clasificar(texto) {
    const t = (texto || '').toLowerCase()
    if (/pelicula|película|movie|vod|cine/.test(t)) return 'movie'
    if (/serie/.test(t)) return 'series'
    return 'live'
  }

  // ---------- DESCARGA + CACHÉ ----------
  async _descargar() {
    const resultados = await Promise.all(
      FUENTES.map(async (fuente) => {
        try {
          const { data } = await axios.get(fuente.url, { timeout: config.httpTimeoutMs })
          return this._parsearM3U(data, fuente.nombre)
        } catch (e) {
          console.warn(`[TV en Vivo] No se pudo descargar ${fuente.nombre}: ${e.message}`)
          return []
        }
      })
    )

    // Aplanar + quitar duplicados por URL + quedarnos con formatos reproducibles
    const vistos = new Set()
    const canales = []
    for (const lista of resultados) {
      for (const c of lista) {
        if (!c.url || vistos.has(c.url)) continue
        const reproducible = /\.m3u8|\.mp4|\.ts(\?|$)/i.test(c.url)
        if (!reproducible) continue
        vistos.add(c.url)
        canales.push({
          titulo: c.nombre,
          poster: c.logo || '',
          url: `tv-${this._hash(c.url)}`, // id estable y seguro para query strings
          stream: c.url,
          grupo: c.grupo,
          pais: c.origen,
          categoria: this._clasificar(`${c.grupo} ${c.nombre}`),
          estado: 'EN VIVO'
        })
      }
    }
    return canales
  }

  async cargar(forzar = false) {
    if (this.canales.length && !forzar) return this.canales
    if (this._cargando) return this._cargando

    this._cargando = (async () => {
      try {
        // 1. Intentar caché en disco si sigue fresca
        if (!forzar && fs.existsSync(CACHE_FILE)) {
          const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
          if (cache.ts && Date.now() - cache.ts < CACHE_TTL && Array.isArray(cache.canales)) {
            this.canales = cache.canales
            console.log(`📡 [TV en Vivo] ${this.canales.length} canales cargados desde caché`)
            return this.canales
          }
        }

        // 2. Descargar de internet y guardar caché
        const canales = await this._descargar()
        this.canales = canales
        try {
          fs.writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), canales }))
        } catch (e) {
          /* la caché es opcional */
        }
        console.log(`📡 [TV en Vivo] ${canales.length} canales descargados y verificados`)
        return this.canales
      } finally {
        this._cargando = null
      }
    })()

    return this._cargando
  }

  // Aplica los filtros activos sobre el catálogo completo.
  _filtrar(filtros = {}) {
    return this.canales.filter((c) => {
      if (filtros.categoria && c.categoria !== filtros.categoria) return false
      if (filtros.pais && c.pais !== filtros.pais) return false
      return true
    })
  }

  _tarjeta(c) {
    return {
      titulo: c.titulo,
      url: c.url,
      poster: c.poster,
      estado: c.estado
    }
  }

  // ---------- CONTRATO DE EXTENSIÓN ----------
  async getCatalogo(filtros = {}, page = 1) {
    await this.cargar()
    const lista = this._filtrar(filtros)
    const inicio = (Number(page) - 1) * PAGE_SIZE
    return lista.slice(inicio, inicio + PAGE_SIZE).map((c) => this._tarjeta(c))
  }

  async buscar(query, page = 1) {
    await this.cargar()
    const q = (query || '').toLowerCase()
    const lista = this.canales.filter((c) => c.titulo.toLowerCase().includes(q))
    const inicio = (Number(page) - 1) * PAGE_SIZE
    return lista.slice(inicio, inicio + PAGE_SIZE).map((c) => this._tarjeta(c))
  }

  async getFiltros() {
    await this.cargar()
    const paises = [...new Set(this.canales.map((c) => c.pais))].sort()
    return [
      {
        id: 'categoria',
        nombre: 'Categoría',
        opciones: [
          { valor: '', etiqueta: 'Todas' },
          { valor: 'live', etiqueta: '📺 TV en vivo' },
          { valor: 'movie', etiqueta: '🎬 Películas' },
          { valor: 'series', etiqueta: '🎞️ Series' }
        ]
      },
      {
        id: 'pais',
        nombre: 'País',
        opciones: [
          { valor: '', etiqueta: 'Todos' },
          ...paises.map((p) => ({ valor: p, etiqueta: p }))
        ]
      }
    ]
  }

  // En TV en vivo no hay "episodios": exponemos el canal como un único elemento jugable.
  async getDetalles(urlPath) {
    await this.cargar()
    const canal = this.canales.find((c) => c.url === urlPath)
    if (!canal) {
      return { titulo: 'Canal no disponible', sinopsis: '', poster: '', episodios: [] }
    }
    return {
      titulo: canal.titulo,
      sinopsis: `Canal en directo · ${canal.pais} · ${canal.grupo}`,
      poster: canal.poster,
      estado: canal.estado,
      generos: [canal.pais, canal.grupo].filter(Boolean),
      episodios: [{ episodio: 1, nombre: 'Canal en Directo', url: canal.url }]
    }
  }

  async getEnlaces(urlEpisodio) {
    await this.cargar()
    const canal = this.canales.find((c) => c.url === urlEpisodio)
    if (!canal) return []
    return [{ nombre: `🔴 ${canal.titulo} (Directo)`, url: canal.stream, referer: canal.stream, hls: /\.m3u8/i.test(canal.stream || '') }]
  }

  // ---------- DATOS PARA LA VISTA IPTV DEDICADA ----------
  // Devuelve todo lo que el reproductor IPTV (estilo Smarters) necesita en una
  // sola llamada: categorías (países) y la lista completa de canales con su
  // stream directo, para permitir zapping y búsqueda instantáneos en el cliente.
  async getDatosTv() {
    await this.cargar()

    const conteoPais = {}
    const conteoCat = {}
    for (const c of this.canales) {
      conteoPais[c.pais] = (conteoPais[c.pais] || 0) + 1
      conteoCat[c.categoria] = (conteoCat[c.categoria] || 0) + 1
    }

    const paises = Object.keys(conteoPais)
      .sort()
      .map((p) => ({ id: `pais:${p}`, nombre: p, icono: '🌎', count: conteoPais[p] }))

    const tipos = [
      { id: 'cat:live', nombre: '📺 TV en vivo', count: conteoCat.live || 0 },
      { id: 'cat:movie', nombre: '🎬 Películas', count: conteoCat.movie || 0 },
      { id: 'cat:series', nombre: '🎞️ Series', count: conteoCat.series || 0 }
    ].filter((t) => t.count > 0)

    const categorias = [
      { id: 'favoritos', nombre: '⭐ Favoritos', icono: '⭐', count: null },
      { id: 'todos', nombre: '🔴 Todos los canales', icono: '🔴', count: this.canales.length },
      ...tipos,
      ...paises
    ]

    return { categorias, canales: this.canales }
  }
}

module.exports = TvEnVivo
