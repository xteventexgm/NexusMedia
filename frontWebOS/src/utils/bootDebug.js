/**
 * Trazas de arranque: consola + #splash-estado + panel fijo #nexus-debug-panel (no se cierra).
 */
var logLinesSplash = []
var logLinesAll = []
var MAX_SPLASH = 8
var huboError = false

function timestamp() {
  try {
    return new Date().toISOString().slice(11, 19)
  } catch (e) {
    return '??:??:??'
  }
}

function formatearError(err) {
  if (err === undefined || err === null) return 'unknown'
  if (typeof err === 'string') return err
  var parts = []
  if (err.message) parts.push(err.message)
  else parts.push(String(err))
  if (err.stack) parts.push(err.stack)
  return parts.join('\n')
}

function esWebOSUA() {
  try {
    return /Web0S|WebOS/i.test(navigator.userAgent || '')
  } catch (e) {
    return false
  }
}

/** Panel visible en TV física durante depuración de catálogo. */
export function debugPanelActivo() {
  return esWebOSUA()
}

function asegurarPanel() {
  if (!debugPanelActivo()) return
  var panel = document.getElementById('nexus-debug-panel')
  if (panel) return
  panel = document.createElement('div')
  panel.id = 'nexus-debug-panel'
  panel.setAttribute('aria-live', 'polite')
  panel.innerHTML =
    '<div id="nexus-debug-panel-head">DEBUG — logs persistentes (no se borran al cargar)</div>' +
    '<pre id="nexus-debug-panel-body"></pre>'
  document.body.appendChild(panel)
}

function pintarPanel() {
  asegurarPanel()
  var body = document.getElementById('nexus-debug-panel-body')
  if (body) body.textContent = logLinesAll.join('\n')
  var panel = document.getElementById('nexus-debug-panel')
  if (panel) panel.classList.toggle('nexus-debug-panel--error', huboError)
}

function pintarSplash(esError) {
  var el = document.getElementById('splash-estado')
  if (!el) return
  el.textContent = logLinesSplash.join('\n')
  el.classList.toggle('splash-estado--error', !!esError)
}

function agregarLinea(linea, esError) {
  logLinesAll.push(linea)
  logLinesSplash.push(linea)
  if (logLinesSplash.length > MAX_SPLASH) logLinesSplash.shift()
  if (esError) huboError = true
  pintarPanel()
  pintarSplash(esError)
}

export function bootTrace(etapa, detalle) {
  var line = '[' + timestamp() + '] ' + etapa
  if (detalle !== undefined && detalle !== null && detalle !== '') {
    line += ': ' + detalle
  }
  console.log('[NexusBoot]', line)
  agregarLinea(line, false)
}

export function bootError(etapa, err) {
  var detalle = formatearError(err)
  var line = '[' + timestamp() + '] !! ' + etapa + ': ' + detalle
  console.error('[NexusBoot]', etapa, err)
  agregarLinea(line, true)
}

export function bootFatal(err) {
  bootError('FATAL', err)
  var el = document.getElementById('splash-estado')
  if (el) {
    el.textContent = 'Error: ' + formatearError(err)
    el.classList.add('splash-estado--error')
  }
}

function importarLineasTempranas() {
  if (typeof window === 'undefined' || !window.__nexusEarlyLines) return
  window.__nexusEarlyLines.forEach(function (linea) {
    if (logLinesAll.indexOf(linea) === -1) logLinesAll.push(linea)
  })
  logLinesSplash = logLinesAll.slice(-MAX_SPLASH)
  pintarPanel()
  pintarSplash(false)
}

/** Expone trazas tempranas desde index.html antes de cargar el bundle. */
export function installEarlyBootBridge() {
  if (typeof window === 'undefined') return
  importarLineasTempranas()
  window.__nexusBootTrace = function (etapa, detalle) {
    bootTrace(etapa, detalle)
  }
  window.__nexusBootError = function (etapa, err) {
    bootError(etapa, err)
  }
}

export function installBootGlobalHandlers() {
  if (typeof window === 'undefined') return

  var enErrorHandler = false

  window.addEventListener('unhandledrejection', function (e) {
    bootError('unhandledrejection', e.reason)
  })

  var prevOnError = window.onerror
  window.onerror = function (msg, src, line, col, err) {
    if (enErrorHandler) return true
    enErrorHandler = true
    try {
      bootError('window.onerror', err || msg + ' @ ' + (src || '') + ':' + (line || ''))
    } finally {
      enErrorHandler = false
    }
    if (typeof prevOnError === 'function') {
      return prevOnError.apply(this, arguments)
    }
    return true
  }
}

export function bootDumpEntorno(getApiUrl, getDefaultApiUrl) {
  asegurarPanel()
  bootTrace('Inicio aplicación', 'bundle ejecutándose')
  bootTrace('User-Agent', navigator.userAgent || 'n/a')
  var chromeMatch = (navigator.userAgent || '').match(/Chrome\/(\d+)/)
  if (chromeMatch) {
    bootTrace('Motor Chrome', 'v' + chromeMatch[1] + (Number(chromeMatch[1]) < 50 ? ' (webOS antiguo — polyfills activos)' : ''))
  }
  bootTrace('navigator.onLine', String(navigator.onLine))
  bootTrace('window.innerWidth×height', window.innerWidth + '×' + window.innerHeight)

  try {
    bootTrace('fetch disponible', typeof fetch === 'function' ? 'sí' : 'NO')
  } catch (e) {
    bootTrace('fetch disponible', 'error al comprobar')
  }

  try {
    bootTrace('System disponible', typeof System !== 'undefined' ? 'sí' : 'NO')
  } catch (e) {
    bootTrace('System disponible', 'NO')
  }

  try {
    var stored = localStorage.getItem('api_url')
    bootTrace('localStorage api_url', stored || '(vacío → defecto)')
  } catch (e) {
    bootTrace('localStorage', 'NO disponible: ' + (e.message || e))
  }

  try {
    if (getDefaultApiUrl) bootTrace('API URL defecto', getDefaultApiUrl())
    if (getApiUrl) {
      bootTrace('API URL activa', getApiUrl())
      console.log('API URL:', getApiUrl())
    }
  } catch (e) {
    bootError('API URL', e)
  }

  if (/localhost|127\.0\.0\.1/i.test(getApiUrl ? getApiUrl() : '')) {
    bootTrace('AVISO', 'localhost no funciona en TV física — usa IP LAN o HTTPS público')
  }

  if (debugPanelActivo()) {
    bootTrace('Panel DEBUG', 'fijo abajo — no desaparece al cargar la app')
  }
}

/** Retraso antes de quitar splash en TV (panel DEBUG sigue abajo). */
export function bootDelaySplashMs() {
  return debugPanelActivo() ? 3000 : 350
}

export function huboErrorBoot() {
  return huboError
}
