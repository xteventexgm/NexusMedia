const { fetchHtml } = require('./httpRelay')
const { UA } = require('./userAgent')

/**
 * Desempaqueta scripts ofuscados con el algoritmo P.A.C.K.E.R (eval(function(p,a,c,k,e,d){...})).
 * Devuelve el código JavaScript ya legible.
 */
function desempaquetarPacker(html) {
  const decodificados = []
  // Anclamos por el patrón numérico ',a,c,' y por '.split('|'), robusto aunque el
  // payload "p" contenga comillas o paréntesis (el bug de cortar en el primer "))").
  const re = /\}\('([\s\S]*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g
  let m

  while ((m = re.exec(html)) !== null) {
    const p = m[1]
    const a = parseInt(m[2], 10)
    const k = m[4].split('|')
    const lookup = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

    const dec = p.replace(/\b\w+\b/g, (token) => {
      let idx = 0
      for (let i = 0; i < token.length; i++) idx = idx * a + lookup.indexOf(token[i])
      return k[idx] || token
    })
    decodificados.push(dec)
  }

  return decodificados.join('\n')
}

/**
 * Extractor específico de Streamtape: reconstruye el enlace directo (mp4) que
 * la web parte en dos strings para evitar el scraping.
 */
function extraerStreamtape(html) {
  const m = html.match(/robotlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']*)'/)
  if (!m) return null
  let parte2 = m[2]
  // El sitio descarta los primeros caracteres de la segunda parte
  parte2 = parte2.substring(3)
  let url = m[1] + parte2
  if (url.startsWith('//')) url = 'https:' + url
  return url + (url.includes('?') ? '&' : '?') + 'stream=1'
}

/**
 * Busca una URL de video reproducible (.m3u8 o .mp4) dentro de un texto.
 */
function buscarUrlVideo(texto) {
  if (!texto) return null
  const matchM3u8 = texto.match(/(https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i)
  if (matchM3u8) return matchM3u8[1]
  const matchMp4 = texto.match(/(https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*)/i)
  if (matchMp4) return matchMp4[1]
  // Algunos hosts guardan la fuente como "file":"..."
  const matchFile = texto.match(/["']?file["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i)
  if (matchFile) return matchFile[1]
  return null
}

/**
 * Dado el embed de un host conocido (vidhide, streamwish, filemoon, etc.),
 * intenta extraer el enlace HLS/MP4 directo para reproducción nativa (autoplay).
 * Devuelve la URL del video o null si no se pudo resolver.
 */
async function extraerVideoDirecto(embedUrl, options = {}) {
  try {
    const referer = options.referer || embedUrl
    if (options.logEmbed69) {
      console.log('[embed69] URL:', embedUrl)
    }

    const html = await fetchHtml(embedUrl, {
      referer,
      timeout: options.timeout || 15000
    })

    // 1) Streamtape (necesita reconstrucción específica)
    if (/streamtape|strtape|stape|tapecontent/i.test(embedUrl) || /robotlink/.test(html)) {
      const st = extraerStreamtape(html)
      if (st) return st
    }

    // 2) Intento directo en el HTML crudo (algunos hosts dejan el m3u8 a la vista)
    const directo = buscarUrlVideo(html)
    if (directo) return directo

    // 3) Desempaquetar packer y volver a buscar
    const desempaquetado = desempaquetarPacker(html)
    const enPacker = buscarUrlVideo(desempaquetado)
    if (enPacker) return enPacker

    return null
  } catch (e) {
    return null
  }
}

module.exports = {
  extraerVideoDirecto,
  desempaquetarPacker,
  buscarUrlVideo,
  extraerStreamtape,
  UA
}
