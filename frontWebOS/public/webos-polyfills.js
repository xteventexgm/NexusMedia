/**
 * Polyfills mínimos para webOS TV (Chrome 38 / WebKit antiguo).
 * Cargar ANTES que cualquier otro script de la app.
 */
;(function (global) {
  'use strict'

  if (!global.Promise) return

  if (!Promise.prototype.finally) {
    Promise.prototype.finally = function (onFinally) {
      var P = this.constructor
      return this.then(
        function (value) {
          return P.resolve(onFinally && onFinally()).then(function () {
            return value
          })
        },
        function (reason) {
          return P.resolve(onFinally && onFinally()).then(function () {
            throw reason
          })
        }
      )
    }
  }

  if (!Object.assign) {
    Object.assign = function (target) {
      if (target == null) throw new TypeError('Cannot convert undefined or null to object')
      var to = Object(target)
      for (var i = 1; i < arguments.length; i++) {
        var from = arguments[i]
        if (from != null) {
          for (var key in from) {
            if (Object.prototype.hasOwnProperty.call(from, key)) to[key] = from[key]
          }
        }
      }
      return to
    }
  }

  if (!Array.from) {
    Array.from = function (arrayLike) {
      return Array.prototype.slice.call(arrayLike)
    }
  }

  if (!Array.prototype.find) {
    Array.prototype.find = function (predicate, thisArg) {
      for (var i = 0; i < this.length; i++) {
        if (predicate.call(thisArg, this[i], i, this)) return this[i]
      }
      return undefined
    }
  }

  if (!Array.prototype.findIndex) {
    Array.prototype.findIndex = function (predicate, thisArg) {
      for (var i = 0; i < this.length; i++) {
        if (predicate.call(thisArg, this[i], i, this)) return i
      }
      return -1
    }
  }

  if (!Array.prototype.includes) {
    Array.prototype.includes = function (search, fromIndex) {
      var o = Object(this)
      var len = parseInt(o.length, 10) || 0
      if (len === 0) return false
      var n = parseInt(fromIndex, 10) || 0
      var k = n >= 0 ? n : Math.max(len + n, 0)
      while (k < len) {
        if (o[k] === search || (search !== search && o[k] !== o[k])) return true
        k++
      }
      return false
    }
  }

  /* Array.prototype.flat — Chrome 69+; la TV física es Chrome 38 */
  if (!Array.prototype.flat) {
    Array.prototype.flat = function (depth) {
      var d = depth === undefined ? 1 : depth
      var out = []
      function flatten(arr, current) {
        for (var i = 0; i < arr.length; i++) {
          if (current > 0 && Array.isArray(arr[i])) flatten(arr[i], current - 1)
          else out.push(arr[i])
        }
      }
      flatten(this, d)
      return out
    }
  }

  /* classList.add/remove con varios tokens — Chrome 50+ */
  if (typeof DOMTokenList !== 'undefined') {
    if (DOMTokenList.prototype.add) {
      var _addOrig = DOMTokenList.prototype.add
      DOMTokenList.prototype.add = function () {
        for (var i = 0; i < arguments.length; i++) {
          _addOrig.call(this, arguments[i])
        }
      }
    }
    if (DOMTokenList.prototype.remove) {
      var _removeOrig = DOMTokenList.prototype.remove
      DOMTokenList.prototype.remove = function () {
        for (var i = 0; i < arguments.length; i++) {
          _removeOrig.call(this, arguments[i])
        }
      }
    }
  }

  if (!String.prototype.includes) {
    String.prototype.includes = function (search, start) {
      if (typeof start !== 'number') start = 0
      return this.indexOf(search, start) !== -1
    }
  }

  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (search, pos) {
      return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search
    }
  }

  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (search, len) {
      if (len === undefined || len > this.length) len = this.length
      return this.substring(len - search.length, len) === search
    }
  }

  /* NodeList.forEach — Chrome 38 no lo tiene (añadido en Chrome 51) */
  if (typeof NodeList !== 'undefined' && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach
  }
  if (typeof HTMLCollection !== 'undefined' && !HTMLCollection.prototype.forEach) {
    HTMLCollection.prototype.forEach = Array.prototype.forEach
  }

  /* classList.toggle(token, force) — Chrome 63+ */
  if (typeof DOMTokenList !== 'undefined' && DOMTokenList.prototype.toggle) {
    var _toggleOrig = DOMTokenList.prototype.toggle
    DOMTokenList.prototype.toggle = function (token, force) {
      if (arguments.length < 2) return _toggleOrig.call(this, token)
      if (force) {
        if (!this.contains(token)) _toggleOrig.call(this, token)
        return true
      }
      if (this.contains(token)) {
        _toggleOrig.call(this, token)
        return false
      }
      return false
    }
  }

  /* Element.closest — Chrome 41+ */
  if (typeof Element !== 'undefined' && !Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var el = this
      while (el && el.nodeType === 1) {
        if (el.matches && el.matches(selector)) return el
        el = el.parentElement
      }
      return null
    }
  }

  if (typeof Element !== 'undefined' && !Element.prototype.matches) {
    Element.prototype.matches =
      Element.prototype.msMatchesSelector ||
      Element.prototype.webkitMatchesSelector ||
      function () {
        return false
      }
  }
})(typeof window !== 'undefined' ? window : this)
