import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getLibrary: () => ipcRenderer.invoke('get-library'),
  saveProgress: (animeObj, urlEpisodio, tiempo, visto, duracion) =>
    ipcRenderer.invoke('save-progress', animeObj, urlEpisodio, tiempo, visto, duracion),
  clearProgress: (animeObj, urlsEpisodios) =>
    ipcRenderer.invoke('clear-progress', animeObj, urlsEpisodios),
  toggleFavorite: (anime) => ipcRenderer.invoke('toggle-favorite', anime)
}

if (process.contextIsolated) {
  try {
    // Solo exponemos nuestra API local
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
