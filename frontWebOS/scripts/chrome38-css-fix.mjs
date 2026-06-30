/**
 * Post-procesador CSS — un solo port para Chrome 38 (webOS TV física).
 * Tailwind 3 emite sintaxis que Chrome 38 no parsea (rgb con espacios, var(), inset, etc.)
 */

export function fixChrome38Css(css) {
  let out = css

  // inset (Chrome 87+)
  out = out.replace(/inset:0/g, 'top:0;right:0;bottom:0;left:0')
  out = out.replace(/inset-x:0/g, 'left:0;right:0')
  out = out.replace(/inset-y:0/g, 'top:0;bottom:0')

  // rgb(R G B / var(--tw-*-opacity, A)) → rgb/rgba clásico
  out = out.replace(
    /(color|background-color|border-color|fill|stroke|outline-color):rgb\((\d+)\s+(\d+)\s+(\d+)\/var\(--tw-[^,]+,(?:\s*([\d.]+))?\)\)/g,
    (_, prop, r, g, b, a) => {
      const alpha = a !== undefined && a !== '' ? a : '1'
      if (alpha === '1') return `${prop}:rgb(${r},${g},${b})`
      return `${prop}:rgba(${r},${g},${b},${alpha})`
    }
  )

  // rgb(R G B / 0.5) sin var
  out = out.replace(
    /(color|background-color|border-color):rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+%?)\)/g,
    '$1:rgba($2,$3,$4,$5)'
  )

  // backdrop-filter (Chrome 76+) y variables asociadas
  out = out.replace(/backdrop-filter:[^;]+;?/g, '')
  out = out.replace(/--tw-backdrop-[a-z-]+:[^;]+;?/g, '')

  // clamp() en alturas
  out = out.replace(/height:clamp\([^)]+\)/g, 'height:360px')
  out = out.replace(/font-size:clamp\([^)]+\)/g, 'font-size:3.5rem')

  // aspect-ratio (Chrome 88+)
  out = out.replace(/aspect-ratio:[^;]+;?/g, '')

  return out
}
