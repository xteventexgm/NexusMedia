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
  } catch {
    return false
  }
}

const memoriaFallback = {}

export const storage = {
  get(key) {
    try {
      if (!storageDisponible()) return memoriaFallback[PREFIX + key] ?? null
      const raw = localStorage.getItem(PREFIX + key)
      if (raw === null) return null
      return JSON.parse(raw)
    } catch {
      return memoriaFallback[PREFIX + key] ?? null
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
    } catch {
      memoriaFallback[PREFIX + key] = value
    }
  },

  remove(key) {
    try {
      if (storageDisponible()) localStorage.removeItem(PREFIX + key)
    } catch {
      /* ignore */
    }
    delete memoriaFallback[PREFIX + key]
  }
}
