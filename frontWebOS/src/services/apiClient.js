import { getApiUrl } from '../config/api.js'
import { bootTrace, bootError } from '../utils/bootDebug.js'

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
  var timeoutMs = opciones.timeout || 35000
  var fetchOpts = {}
  for (var k in opciones) {
    if (k !== 'timeout') fetchOpts[k] = opciones[k]
  }
  fetchOpts.timeout = timeoutMs

  var base = getApiUrl()
  var url = base + ruta

  bootTrace('API URL', base)
  bootTrace('Voy a solicitar catálogo', url)
  bootTrace('navigator.onLine', String(navigator.onLine))
  bootTrace('fetch → inicio', ruta + ' (timeout ' + timeoutMs + 'ms)')

  try {
    var res = await fetch(url, fetchOpts)
    bootTrace(
      'fetch → HTTP',
      res.status + ' ' + (res.statusText || '') + (res.ok ? ' OK' : ' ERROR')
    )

    var text = await res.text()
    var preview = text.length > 280 ? text.slice(0, 280) + '…[' + text.length + ' chars]' : text
    bootTrace('fetch → body (text)', preview || '(vacío)')

    if (!res.ok) {
      var httpErr = new Error(text || 'Error del servidor (' + res.status + ')')
      bootError('HTTP ' + res.status + ' en ' + ruta, httpErr)
      throw httpErr
    }

    if (!text || !text.trim()) {
      var vacioErr = new Error('Respuesta vacía del servidor')
      bootError('body vacío en ' + ruta, vacioErr)
      throw vacioErr
    }

    var data
    try {
      data = JSON.parse(text)
    } catch (parseErr) {
      bootError('JSON.parse en ' + ruta, parseErr)
      bootTrace('JSON inválido — body completo (500)', text.slice(0, 500))
      throw parseErr
    }

    var resumen =
      Array.isArray(data) ? data.length + ' items' : data && typeof data === 'object' ? 'object' : typeof data
    bootTrace('Catálogo recibido', ruta + ' → ' + resumen)
    return data
  } catch (err) {
    bootError('fetch falló: ' + ruta, err)

    var msg = err.message || 'Error de conexión con el servidor'
    if (msg === 'Failed to fetch' || msg === 'Network request failed') {
      msg =
        'No se pudo conectar (red/TLS/CORS). URL: ' +
        url +
        ' — Verifica Ajustes y que no sea localhost.'
      bootTrace('Posible causa', 'TLS/CORS/red — el navegador TV ≠ WebView app')
    }
    if (/access-control|CORS/i.test(msg)) {
      bootTrace('CORS', 'El servidor debe enviar Access-Control-Allow-Origin')
    }

    mostrarErrorApi(msg)
    throw err
  }
}
