/**
 * Polyfill mínimo de fetch (XHR) para webOS TV donde fetch no existe
 * o SystemJS no puede cargar chunks al arrancar.
 */
;(function (global) {
  if (global.fetch) return

  function parseHeaders(raw) {
    var map = {}
    if (!raw) return map
    raw.split('\r\n').forEach(function (line) {
      var i = line.indexOf(':')
      if (i > 0) map[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
    })
    return map
  }

  global.fetch = function (url, options) {
    options = options || {}
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest()
      var method = (options.method || 'GET').toUpperCase()
      var timeoutMs = options.timeout || 30000
      xhr.open(method, url, true)
      xhr.timeout = timeoutMs

      if (options.credentials === 'include') xhr.withCredentials = true

      var headers = options.headers || {}
      if (headers.forEach && typeof headers.forEach === 'function') {
        headers.forEach(function (value, key) {
          xhr.setRequestHeader(key, value)
        })
      } else {
        Object.keys(headers).forEach(function (key) {
          xhr.setRequestHeader(key, headers[key])
        })
      }

      xhr.onload = function () {
        var headerMap = parseHeaders(xhr.getAllResponseHeaders())
        var response = {
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          url: url,
          headers: {
            get: function (name) {
              return headerMap[String(name).toLowerCase()] || null
            }
          },
          text: function () {
            return Promise.resolve(xhr.responseText)
          },
          json: function () {
            return Promise.resolve(JSON.parse(xhr.responseText))
          }
        }
        resolve(response)
      }

      xhr.onerror = function () {
        reject(new TypeError('Network request failed'))
      }
      xhr.ontimeout = function () {
        reject(new TypeError('Network request failed'))
      }
      xhr.onabort = function () {
        reject(new TypeError('Network request failed'))
      }

      xhr.send(options.body || null)
    })
  }

  if (global.System && !global.System.fetch) {
    global.System.fetch = global.fetch
  }
})(typeof window !== 'undefined' ? window : this)
