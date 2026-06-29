export const SERVER_URL = 'http://localhost:3000/api'

let toastTimer

export function mostrarErrorApi(mensaje) {
  let el = document.getElementById('toast-error')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast-error'
    el.className =
      'fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] hidden max-w-lg px-5 py-3 rounded-xl bg-red-600/95 text-white text-sm font-semibold shadow-2xl border border-red-400/40 text-center'
    document.body.appendChild(el)
  }
  el.textContent = mensaje
  el.classList.remove('hidden')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.add('hidden'), 6000)
}

export async function apiFetch(ruta, opciones = {}) {
  try {
    const res = await fetch(`${SERVER_URL}${ruta}`, opciones)
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      throw new Error(detalle || `Error del servidor (${res.status})`)
    }
    return await res.json()
  } catch (err) {
    const msg =
      err.message === 'Failed to fetch'
        ? 'No se pudo conectar con el motor de contenido. ¿Está el servidor activo?'
        : err.message || 'Error de conexión con el servidor'
    mostrarErrorApi(msg)
    throw err
  }
}
