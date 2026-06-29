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

export function isEnterKey(event) {
  return event.key === 'Enter' || event.key === 'OK' || event.keyCode === 13
}

export function isSelectKey(event) {
  return isEnterKey(event) || event.key === ' ' || event.code === 'Space'
}
