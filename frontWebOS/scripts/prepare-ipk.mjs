/**
 * Post-build para IPK webOS:
 * - Copia appinfo.json e icon.png
 * - Elimina chunks ES module (ares-package falla al minificarlos)
 * - Deja solo *-legacy-*.js y reescribe index.html si hace falta
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

console.log('✓ appinfo.json copiado a dist/')

if (existsSync(assetsDir)) {
  const files = readdirSync(assetsDir)
  let removed = 0
  for (const file of files) {
    if (!file.endsWith('.js')) continue
    if (file.includes('-legacy-')) continue
    unlinkSync(join(assetsDir, file))
    removed++
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
  writeFileSync(indexPath, html, 'utf8')
  console.log('✓ index.html ajustado para webOS (solo legacy, sin type=module)')
}

console.log('')
console.log('Empaquetar IPK (webOS CLI):')
console.log('  cd frontWebOS/dist')
console.log('  ares-package .')
console.log('  ares-install --device TV com.nexusmedia.webos_1.0.0_all.ipk')
