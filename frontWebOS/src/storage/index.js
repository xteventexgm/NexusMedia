const PREFIX = 'nexus_'

/**
 * Adaptador de almacenamiento local (localStorage).
 * Sustituye el acceso a filesystem vía Electron IPC.
 */
function storageDisponible() {
  try {
    var probe = PREFIX + '__probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch (e) {
    return false
  }
}

const memoriaFallback = {}

export const storage = {
  get(key) {
    try {
      if (!storageDisponible()) {
        var mem = memoriaFallback[PREFIX + key]
        return mem !== undefined && mem !== null ? mem : null
      }
      const raw = localStorage.getItem(PREFIX + key)
      if (raw === null) return null
      return JSON.parse(raw)
    } catch (e) {
      var fallback = memoriaFallback[PREFIX + key]
      return fallback !== undefined && fallback !== null ? fallback : null
    }
  },

  set(key, value) {
    const serializado = JSON.stringify(value)
    try {
      if (!storageDisponible()) {
        memoriaFallback[PREFIX + key] = value
        return
      }
      localStorage.setItem(PREFIX + key, serializado)
    } catch (e) {
      memoriaFallback[PREFIX + key] = value
    }
  },

  remove(key) {
    try {
      if (storageDisponible()) localStorage.removeItem(PREFIX + key)
    } catch (e) {
      /* ignore */
    }
    delete memoriaFallback[PREFIX + key]
  }
}
