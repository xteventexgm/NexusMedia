import { storage } from './index.js'

const LIBRARY_KEY = 'library'

function readDB() {
  const data = storage.get(LIBRARY_KEY)
  if (!data || typeof data !== 'object') {
    const fresh = { favoritos: [], progreso: {}, historial: [] }
    storage.set(LIBRARY_KEY, fresh)
    return fresh
  }
  if (!Array.isArray(data.favoritos)) data.favoritos = []
  if (!data.progreso || typeof data.progreso !== 'object') data.progreso = {}
  if (!Array.isArray(data.historial)) data.historial = []
  return data
}

function writeDB(data) {
  storage.set(LIBRARY_KEY, data)
}

/**
 * API de biblioteca local — misma interfaz que window.api del preload Electron.
 */
export const libraryApi = {
  getLibrary() {
    return Promise.resolve(readDB())
  },

  saveProgress(animeObj, urlEpisodio, tiempo, visto, duracion) {
    if (!animeObj || !animeObj.url) {
      return Promise.resolve(readDB().historial || [])
    }
    const db = readDB()
    if (tiempo === 0 && !visto) {
      db.historial = db.historial.filter((h) => h.url !== animeObj.url)
    } else {
      const entrada = { tiempo, visto }
      if (duracion > 0) entrada.duracion = duracion
      db.progreso[urlEpisodio] = entrada
      db.historial = db.historial.filter((h) => h.url !== animeObj.url)
      db.historial.unshift(animeObj)
      if (db.historial.length > 50) db.historial.pop()
    }
    writeDB(db)
    return Promise.resolve(db.historial)
  },

  clearProgress(animeObj, urlsEpisodios = []) {
    const db = readDB()
    if (Array.isArray(urlsEpisodios)) {
      urlsEpisodios.forEach((url) => {
        if (url) delete db.progreso[url]
      })
    }
    if (animeObj && animeObj.url) {
      db.historial = db.historial.filter((h) => h.url !== animeObj.url)
    }
    writeDB(db)
    return Promise.resolve({ historial: db.historial, progreso: db.progreso })
  },

  toggleFavorite(anime) {
    if (!anime || !anime.url) return Promise.resolve(readDB().favoritos || [])
    const db = readDB()
    const index = db.favoritos.findIndex((f) => f.url === anime.url)
    if (index === -1) db.favoritos.push(anime)
    else db.favoritos.splice(index, 1)
    writeDB(db)
    return Promise.resolve(db.favoritos)
  }
}
