/**
 * Post-build para IPK webOS:
 * - Copia appinfo.json, icon.png y fetch-polyfill.js
 * - Elimina chunks ES module (ares-package falla al minificarlos)
 * - Mantiene polyfills-legacy (SystemJS, ~15KB) + System.import del bundle
 * - Enlaza CSS estático
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const assetsDir = join(dist, 'assets')

mkdirSync(dist, { recursive: true })

copyFileSync(join(root, 'appinfo.json'), join(dist, 'appinfo.json'))

const iconSrc = join(root, 'public', 'icon.png')
const iconDst = join(dist, 'icon.png')
if (existsSync(iconSrc)) {
  copyFileSync(iconSrc, iconDst)
  console.log('✓ icon.png copiado a dist/')
} else {
  console.warn('⚠ Falta public/icon.png (130×130). Añádelo antes de ares-package.')
}

const fetchPoly = join(root, 'public', 'fetch-polyfill.js')
const webosPoly = join(root, 'public', 'webos-polyfills.js')
if (existsSync(webosPoly)) {
  copyFileSync(webosPoly, join(dist, 'webos-polyfills.js'))
  console.log('✓ webos-polyfills.js copiado a dist/')
}
if (existsSync(fetchPoly)) {
  copyFileSync(fetchPoly, join(dist, 'fetch-polyfill.js'))
  console.log('✓ fetch-polyfill.js copiado a dist/')
}

console.log('✓ appinfo.json copiado a dist/')

if (existsSync(assetsDir)) {
  const files = readdirSync(assetsDir)
  let removed = 0
  for (const file of files) {
    if (file.endsWith('.js') && !file.includes('-legacy-')) {
      unlinkSync(join(assetsDir, file))
      removed++
      continue
    }
    if (file.endsWith('.js') && file.includes('-legacy-') && !file.startsWith('index-legacy-') && !file.startsWith('polyfills-legacy-')) {
      unlinkSync(join(assetsDir, file))
      console.log(`✓ Eliminado chunk legacy extra: ${file}`)
    }
  }
  if (removed > 0) {
    console.log(`✓ Eliminados ${removed} chunk(s) ES module (incompatibles con ares-package)`)
  }
}

const indexPath = join(dist, 'index.html')
if (existsSync(indexPath)) {
  let html = readFileSync(indexPath, 'utf8')

  html = html.replace(/<script type="module"[^>]*>[\s\S]*?<\/script>\s*/gi, '')
  html = html.replace(/<script type="module"[^>]*\/>/gi, '')
  html = html.replace(/<link rel="modulepreload"[^>]*>\s*/gi, '')
  html = html.replace(/\s*nomodule/g, '')
  html = html.replace(/\s+crossorigin/g, '')

  // polyfills-legacy define global System (requerido por index-legacy System.register)
  html = html.replace(
    /<script[^>]*id="vite-legacy-polyfill"[^>]*src="([^"]+)"[^>]*>\s*<\/script>/i,
    '<script src="$1"></script>'
  )

  // System.import ejecuta el bundle; NO usar solo <script src> del index
  html = html.replace(
    /<script[^>]*id="vite-legacy-entry"[^>]*>[\s\S]*?<\/script>/i,
    (tag) => {
      const m = tag.match(/data-src="([^"]+)"/)
      if (!m) return tag
      const src = m[1]
      return `<script>
    if (window.__nexusBootTrace) window.__nexusBootTrace('System.import', '${src}')
    System.import('${src}').catch(function (err) {
      var msg = err && err.message ? err.message : String(err)
      if (window.__nexusBootError) window.__nexusBootError('System.import', err)
      else {
        var s = document.getElementById('splash-estado')
        if (s) s.textContent = 'Error al cargar: ' + msg
      }
      console.error('System.import falló:', err)
    })
  </script>`
    }
  )

  if (!html.includes('fetch-polyfill.js')) {
    html = html.replace(
      /<meta charset="UTF-8"\s*\/>/i,
      '<meta charset="UTF-8" />\n    <script src="./fetch-polyfill.js"></script>'
    )
  }

  const cssPath = './assets/app-legacy.css'
  if (existsSync(join(dist, 'assets', 'app-legacy.css')) && !html.includes('app-legacy.css')) {
    html = html.replace('</head>', `    <link rel="stylesheet" href="${cssPath}" />\n  </head>`)
    console.log('✓ CSS enlazado: assets/app-legacy.css')
  }

  writeFileSync(indexPath, html, 'utf8')
  console.log('✓ index.html ajustado (fetch → SystemJS → System.import)')
}

console.log('')
console.log('Empaquetar IPK (webOS CLI):')
console.log('  cd frontWebOS/dist')
console.log('  ares-package .')
try {
  const appinfo = JSON.parse(readFileSync(join(root, 'appinfo.json'), 'utf8'))
  const ver = appinfo.version || '1.0.0'
  console.log(`  ares-install --device TV com.nexusmedia.webos_${ver}_all.ipk`)
} catch (_) {
  console.log('  ares-install --device TV com.nexusmedia.webos_*_all.ipk')
}
