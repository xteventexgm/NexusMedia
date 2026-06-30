/**
 * Detecta URLs reproducibles con video nativo / hls.js (no iframe).
 */
export function isStreamPlaybackUrl(url) {
  if (!url) return false
  const u = url.toLowerCase()
  return (
    u.includes('.m3u8') ||
    u.includes('/api/stream/proxy') ||
    u.includes('/stream/proxy') ||
    u.includes('.mp4') ||
    u.includes('.ts') ||
    u.includes('get_video') ||
    u.includes('zilla-networks.com/m3u8')
  )
}

export function isHlsServerName(name) {
  return /auto-play hls/i.test(name || '')
}
