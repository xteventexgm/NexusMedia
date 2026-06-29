export function formatTime(time) {
  if (!time || isNaN(time)) return '00:00'
  const hrs = Math.floor(time / 3600)
  const mins = Math.floor((time % 3600) / 60)
  const secs = Math.floor(time % 60)
  const mm = mins < 10 && hrs > 0 ? '0' + mins : mins
  const ss = secs < 10 ? '0' + secs : secs
  return hrs > 0 ? hrs + ':' + mm + ':' + ss : mm + ':' + ss
}
