/**
 * Utilidades de teclado / mando remoto para Smart TV.
 * LG WebOS: botón Back suele enviar keyCode 461.
 */

/** Atrás del mando remoto — NO incluye Backspace (borrar en teclado virtual). */
export function isBackKey(event) {
  if (!event) return false
  const k = event.key || ''
  const kc = event.keyCode || event.which || 0
  return k === 'Escape' || k === 'GoBack' || kc === 461 || kc === 10009
}

export function isDeleteKey(event) {
  if (!event) return false
  const k = event.key || ''
  const kc = event.keyCode || event.which || 0
  return k === 'Backspace' || k === 'Delete' || kc === 8 || kc === 46
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
