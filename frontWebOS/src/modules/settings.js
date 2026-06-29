import { getApiUrl, getDefaultApiUrl, setApiUrl, resetApiUrl, normalizeApiInput } from '../config/api.js'
import { isBackKey } from '../utils/keys.js'

/**
 * Pantalla de ajustes: URL del servidor, prueba de conexión y restauración.
 * @param {{ onGuardado?: (urlNueva: string, urlAnterior: string) => void | Promise<void> }} options
 */
export function initSettingsModule(options) {
  if (options === undefined) options = {}
  var onGuardado = options.onGuardado

  var modal = document.getElementById('modal-ajustes')
  var btnAbrir = document.getElementById('btn-ajustes')
  var btnCerrar = document.getElementById('btn-cerrar-ajustes')
  var inputUrl = document.getElementById('input-api-url')
  var btnProbar = document.getElementById('btn-probar-api')
  var btnGuardar = document.getElementById('btn-guardar-api')
  var btnRestaurar = document.getElementById('btn-restaurar-api')
  var estadoApi = document.getElementById('estado-api-ajustes')
  var textoDefecto = document.getElementById('texto-api-defecto')

  if (!modal || !btnAbrir) return { abrirAjustes: function () {} }

  if (textoDefecto) textoDefecto.textContent = getDefaultApiUrl()

  function mostrarEstado(msg, tipo) {
    if (!estadoApi) return
    estadoApi.textContent = msg
    estadoApi.className = 'settings-status settings-status--' + (tipo || 'info')
    estadoApi.classList.remove('hidden')
  }

  function ocultarEstado() {
    if (estadoApi) estadoApi.classList.add('hidden')
  }

  function rellenarFormulario() {
    if (inputUrl) inputUrl.value = getApiUrl()
  }

  function abrirAjustes() {
    rellenarFormulario()
    ocultarEstado()
    modal.classList.remove('hidden')
    modal.classList.add('flex')
    setTimeout(function () {
      if (inputUrl) inputUrl.focus()
    }, 80)
  }

  function cerrarAjustes() {
    modal.classList.add('hidden')
    modal.classList.remove('flex')
    ocultarEstado()
  }

  btnAbrir.addEventListener('click', abrirAjustes)
  if (btnCerrar) btnCerrar.addEventListener('click', cerrarAjustes)

  modal.addEventListener('click', function (e) {
    if (e.target === modal) cerrarAjustes()
  })

  document.addEventListener(
    'keydown',
    function (e) {
      if (modal.classList.contains('hidden')) return
      if (isBackKey(e)) {
        cerrarAjustes()
        e.preventDefault()
        e.stopPropagation()
      }
    },
    true
  )

  async function probarConexion(urlOverride) {
    var base = urlOverride || normalizeApiInput(inputUrl ? inputUrl.value : '') || getApiUrl()
    mostrarEstado('Probando conexión…', 'info')
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    var timeoutId = setTimeout(function () {
      if (controller) controller.abort()
    }, 10000)
    try {
      var res = await fetch(base + '/providers', {
        signal: controller ? controller.signal : undefined
      })
      clearTimeout(timeoutId)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      var data = await res.json()
      var n = Array.isArray(data) ? data.length : 0
      mostrarEstado('Conexión correcta · ' + n + ' extensiones disponibles', 'ok')
      return true
    } catch (err) {
      clearTimeout(timeoutId)
      mostrarEstado('No se pudo conectar: ' + (err.message || 'error desconocido'), 'error')
      return false
    }
  }

  if (btnProbar) {
    btnProbar.addEventListener('click', function () {
      var url = normalizeApiInput(inputUrl ? inputUrl.value : '')
      probarConexion(url || getApiUrl())
    })
  }

  if (btnGuardar) {
    btnGuardar.addEventListener('click', async function () {
      var url = normalizeApiInput(inputUrl ? inputUrl.value : '')
      if (!url) {
        mostrarEstado('Introduce una URL válida (ej. http://192.168.1.10:3000/api)', 'error')
        return
      }

      var urlAnterior = getApiUrl()
      setApiUrl(url)
      cerrarAjustes()

      if (onGuardado) {
        try {
          await onGuardado(url, urlAnterior)
        } catch (err) {
          console.error('Error tras guardar ajustes:', err)
        }
      }
    })
  }

  if (btnRestaurar) {
    btnRestaurar.addEventListener('click', function () {
      resetApiUrl()
      rellenarFormulario()
      mostrarEstado('Restaurado al valor por defecto: ' + getDefaultApiUrl(), 'info')
    })
  }

  return { abrirAjustes: abrirAjustes, cerrarAjustes: cerrarAjustes }
}
