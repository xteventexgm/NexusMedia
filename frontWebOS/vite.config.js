import { defineConfig } from 'vite'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  base: './',
  plugins: [
    legacy({
      targets: ['chrome >= 38', 'android >= 4.4'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      modernPolyfills: true
    })
  ],
  build: {
    target: 'es2015',
    cssTarget: 'chrome38',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: function (id) {
          if (id.includes('node_modules/hls.js')) return 'hls'
          if (id.includes('src/modules/player.js')) return 'player'
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
})
