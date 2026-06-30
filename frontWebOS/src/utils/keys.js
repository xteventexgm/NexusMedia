/**
 * Utilidades de teclado / mando remoto para Smart TV.
 * LG WebOS: botón Back suele enviar keyCode 461.
 */

export function isBackKey(event) {
  return (
    event.key === 'Escape' ||
    event.key === 'Backspace' ||
    event.key === 'GoBack' ||
    event.keyCode === 461 ||
    event.keyCode === 10009
  )
}

/** Códigos OK/Enter en mandos LG (webOS 3–24, simulador incl.). */
export function isEnterKey(event) {
  if (!event) return false
  const k = event.key || ''
  const code = event.code || ''
  const kc = event.keyCode || event.which || 0
  return (
    k === 'Enter' ||
    k === 'OK' ||
    k === 'Select' ||
    k === 'NumpadEnter' ||
    code === 'Enter' ||
    code === 'NumpadEnter' ||
    kc === 13 ||
    kc === 28 ||
    kc === 16777221
  )
}

export function isSelectKey(event) {
  return isEnterKey(event) || event.key === ' ' || event.code === 'Space'
}
