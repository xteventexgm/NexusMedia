const PREFIX = 'nexus_'

/**
 * Adaptador de almacenamiento local (localStorage).
 * Sustituye el acceso a filesystem vía Electron IPC.
 */
export const storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (raw === null) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  },

  remove(key) {
    localStorage.removeItem(PREFIX + key)
  }
}
