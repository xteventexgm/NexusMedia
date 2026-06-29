import { getApiUrl } from '../config/api.js'

let toastErrorTimer
let toastOkTimer

function crearToast(id, className) {
  var el = document.getElementById(id)
  if (!el) {
    el = document.createElement('div')
    el.id = id
    el.className = className + ' hidden'
    document.body.appendChild(el)
  }
  return el
}

export function mostrarErrorApi(mensaje) {
  var el = crearToast(
    'toast-error',
    'fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] max-w-lg px-5 py-3 rounded-xl bg-red-600/95 text-white text-sm font-semibold shadow-2xl border border-red-400/40 text-center'
  )
  el.textContent = mensaje
  el.classList.remove('hidden')
  clearTimeout(toastErrorTimer)
  toastErrorTimer = setTimeout(function () {
    el.classList.add('hidden')
  }, 6000)
}

export function mostrarToastExito(mensaje) {
  var el = crearToast(
    'toast-ok',
    'fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] max-w-lg px-5 py-3 rounded-xl bg-green-700/95 text-white text-sm font-semibold shadow-2xl border border-green-400/40 text-center'
  )
  el.textContent = mensaje
  el.classList.remove('hidden')
  clearTimeout(toastOkTimer)
  toastOkTimer = setTimeout(function () {
    el.classList.add('hidden')
  }, 4500)
}

export async function apiFetch(ruta, opciones) {
  if (opciones === undefined) opciones = {}
  try {
    const res = await fetch(getApiUrl() + ruta, opciones)
    if (!res.ok) {
      const detalle = await res.text().catch(function () {
        return ''
      })
      throw new Error(detalle || 'Error del servidor (' + res.status + ')')
    }
    return await res.json()
  } catch (err) {
    const msg =
      err.message === 'Failed to fetch'
        ? 'No se pudo conectar con el motor de contenido. Verifica la URL del servidor en ajustes.'
        : err.message || 'Error de conexión con el servidor'
    mostrarErrorApi(msg)
    throw err
  }
}
