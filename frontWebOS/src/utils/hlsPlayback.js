/**
 * Reproducción HLS: nativo primero, hls.js solo como fallback.
 * Reset completo del <video>, espera de eventos y un reintento automático.
 */

let hlsModulePromise = null

function loadHlsModule() {
  if (!hlsModulePromise) {
    hlsModulePromise = import('hls.js').then(function (m) {
      return m.default
    })
  }
  return hlsModulePromise
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

export function supportsNativeHls(video) {
  if (!video || !video.canPlayType) return false
  return (
    video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
    video.canPlayType('application/x-mpegURL') !== ''
  )
}

function isM3u8Url(url) {
  if (/\.m3u8(\?|$)/i.test(url || '')) return true
  if (/\/api\/stream\/proxy/i.test(url || '')) return true
  if (/\/stream\/proxy/i.test(url || '')) return true
  return false
}

/** Opciones conservadoras para TVs con poca RAM. */
function createHlsInstance(Hls) {
  return new Hls({
    enableWorker: false,
    lowLatencyMode: false,
    maxBufferLength: 12,
    maxMaxBufferLength: 24,
    maxBufferSize: 15 * 1000 * 1000,
    backBufferLength: 0,
    startFragPrefetch: false
  })
}

/**
 * Limpia por completo el elemento video antes de un nuevo stream.
 */
export async function resetVideoElement(video) {
  if (!video) return

  video.pause()

  var sources = video.querySelectorAll('source')
  for (var i = 0; i < sources.length; i++) {
    sources[i].remove()
  }

  video.removeAttribute('src')
  if (video.srcObject) {
    video.srcObject = null
  }

  return new Promise(function (resolve) {
    var settled = false
    function done() {
      if (settled) return
      settled = true
      video.removeEventListener('emptied', done)
      resolve()
    }
    video.addEventListener('emptied', done)
    try {
      video.load()
    } catch (e) {
      done()
      return
    }
    setTimeout(done, 280)
  })
}

/**
 * Espera un evento del video con timeout.
 */
function waitForVideoEvent(video, eventName, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var settled = false
    var timer = setTimeout(function () {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('Timeout esperando ' + eventName))
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timer)
      video.removeEventListener(eventName, onOk)
      video.removeEventListener('error', onErr)
      video.removeEventListener('loadeddata', onOk)
      video.removeEventListener('canplay', onOk)
    }

    function onOk() {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    function onErr() {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('Error en elemento video (' + eventName + ')'))
    }

    if (eventName === 'loadedmetadata' && video.readyState >= 1) {
      onOk()
      return
    }
    if (eventName === 'canplay' && video.readyState >= 3) {
      onOk()
      return
    }
    if (eventName === 'loadeddata' && video.readyState >= 2) {
      onOk()
      return
    }

    video.addEventListener(eventName, onOk)
    video.addEventListener('error', onErr)
  })
}

/** Espera a que el video esté listo tras asignar una URL nativa. */
async function waitForNativeReady(video) {
  await waitForVideoEvent(video, 'loadedmetadata', 14000)
  try {
    await waitForVideoEvent(video, 'loadeddata', 8000)
  } catch (e) {
    /* loadeddata opcional en algunos WebOS */
  }
  try {
    await waitForVideoEvent(video, 'canplay', 6000)
  } catch (e) {
    /* canplay opcional si ya hay metadata */
  }
}

function startNativeHls(video, url) {
  video.src = url
  video.load()
  return waitForNativeReady(video).then(function () {
    return {
      type: 'native',
      destroy: function () {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  })
}

function startDirectVideo(video, url) {
  video.src = url
  video.load()
  return waitForNativeReady(video).then(function () {
    return {
      type: 'direct',
      destroy: function () {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  })
}

function startHlsJs(video, url) {
  return loadHlsModule().then(function (Hls) {
    if (!Hls.isSupported()) {
      throw new Error('HLS.js no soportado en este navegador')
    }

    var hls = createHlsInstance(Hls)

    return new Promise(function (resolve, reject) {
      var settled = false

      function finish(err, handle) {
        if (settled) return
        settled = true
        if (err) reject(err)
        else resolve(handle)
      }

      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        finish(null, {
          type: 'hls.js',
          instance: hls,
          destroy: function () {
            try {
              hls.destroy()
            } catch (e) {
              /* ignorar */
            }
          }
        })
      })

      hls.on(Hls.Events.ERROR, function (_event, data) {
        if (!data.fatal) return
        console.log('[HLS] Error detectado', data.type, data.details)
        try {
          hls.destroy()
        } catch (e) {
          /* ignorar */
        }
        finish(data)
      })

      hls.loadSource(url)
      hls.attachMedia(video)
    })
  })
}

/**
 * Un intento de reproducción (sin reintento).
 */
async function createStreamHandle(video, url, attemptIndex) {
  if (isM3u8Url(url)) {
    const tryNativeFirst = supportsNativeHls(video) && attemptIndex === 0
    if (tryNativeFirst) {
      try {
        return await startNativeHls(video, url)
      } catch (nativeErr) {
        console.log('[HLS] Nativo falló, probando hls.js', nativeErr)
      }
    }
    return startHlsJs(video, url)
  }

  return startDirectVideo(video, url)
}

/**
 * @param {HTMLVideoElement} video
 * @param {string} url
 * @param {{ onReady?: () => void, onError?: (err?: unknown) => void }} callbacks
 * @returns {Promise<{ destroy: () => void } | null>}
 */
export async function attachStream(video, url, callbacks) {
  if (callbacks === undefined) callbacks = {}
  var onReady = callbacks.onReady
  var onError = callbacks.onError

  if (!video || !url) {
    if (onError) onError(new Error('Video o URL no válidos'))
    return null
  }

  var lastError = null
  var maxAttempts = 2

  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt === 0) {
      console.log('[HLS] Inicializando...')
    } else {
      console.log('[HLS] Reintentando...')
    }

    var innerHandle = null

    try {
      await resetVideoElement(video)
      await delay(attempt === 0 ? 40 : 180)

      innerHandle = await createStreamHandle(video, url, attempt)
      console.log('[HLS] Stream adjuntado')

      if (onReady) onReady()

      return {
        destroy: function () {
          if (innerHandle && innerHandle.destroy) {
            try {
              innerHandle.destroy()
            } catch (e) {
              /* ignorar */
            }
          }
          resetVideoElement(video)
        }
      }
    } catch (err) {
      lastError = err
      console.log('[HLS] Error detectado', err)

      if (innerHandle && innerHandle.destroy) {
        try {
          innerHandle.destroy()
        } catch (e) {
          /* ignorar */
        }
      }

      await resetVideoElement(video)
    }
  }

  if (onError) onError(lastError)
  return null
}

export function destroyStreamHandle(handle) {
  if (handle && handle.destroy) {
    try {
      handle.destroy()
    } catch (e) {
      /* ignorar */
    }
  }
}

export async function prepareVideoForPlayback(video) {
  await resetVideoElement(video)
}
