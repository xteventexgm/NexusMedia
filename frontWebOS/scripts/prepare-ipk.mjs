import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

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
console.log('')
console.log('Empaquetar IPK (webOS CLI):')
console.log('  cd frontWebOS/dist')
console.log('  ares-package .')
console.log('  ares-install --device TV com.nexusmedia.webos_1.0.0_all.ipk')
