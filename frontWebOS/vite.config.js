import { defineConfig } from 'vite'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  base: './',
  plugins: [
    legacy({
      targets: ['chrome >= 38', 'android >= 4.4'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      modernPolyfills: false,
      polyfills: false,
      // Solo bundles ES5: ares-package no puede minificar JS moderno (type=module)
      renderModernChunks: false
    })
  ],
  build: {
    target: 'es2015',
    cssTarget: 'chrome38',
    cssCodeSplit: false,
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Un solo JS legacy: evita import() dinámico que requiere fetch en la TV
        inlineDynamicImports: true
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
})
