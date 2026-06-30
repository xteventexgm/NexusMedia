/**
 * Compila Tailwind + port Chrome 38 para la TV.
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { fixChrome38Css } from './chrome38-css-fix.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = join(root, 'dist', 'assets')
const outFile = join(assetsDir, 'app-legacy.css')

mkdirSync(assetsDir, { recursive: true })

execSync(
  `npx tailwindcss -i ./src/styles/main.css -o ./dist/assets/app-legacy.css --minify`,
  { cwd: root, stdio: 'inherit' }
)

if (!existsSync(outFile)) {
  throw new Error('No se generó dist/assets/app-legacy.css')
}

let css = readFileSync(outFile, 'utf8')
const chrome38Path = join(root, 'src', 'styles', 'chrome38-tv.css')
if (existsSync(chrome38Path)) {
  css += '\n' + readFileSync(chrome38Path, 'utf8')
}
const antes = (css.match(/\/var\(--tw-/g) || []).length
css = fixChrome38Css(css)
const despues = (css.match(/\/var\(--tw-/g) || []).length
writeFileSync(outFile, css)

console.log('✓ CSS TV compilado: dist/assets/app-legacy.css')
console.log(`✓ Port Chrome 38: colores rgb/var corregidos (${antes} → ${despues} restantes)`)
