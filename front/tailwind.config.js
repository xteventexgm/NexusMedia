/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,html}'
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#e50914', dark: '#b20710', light: '#f6121d' },
        base: '#0a0a0c',
        surface: '#141418',
        surface2: '#1d1d24'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Bebas Neue"', 'Inter', 'sans-serif']
      }
    }
  },
  plugins: []
}
