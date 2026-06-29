import { app, ipcMain, BrowserWindow, dialog, session } from 'electron'
import fs from 'fs'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { exec, fork } from 'child_process'

let serverProcess = null
const API_PORT = 3000
const getApiBase = () => `http://127.0.0.1:${API_PORT}/api`

async function waitForServer(maxAttempts = 40, intervalMs = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${getApiBase()}/providers`)
      if (res.ok) return true
    } catch {
      /* reintento */
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

async function manageServer() {
  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, 'src', 'servidor')
    : path.join(app.getAppPath(), 'src', 'servidor')
  const serverEntry = path.join(serverDir, 'server.js')

  try {
    serverProcess = fork(serverEntry, [], {
      cwd: serverDir,
      windowsHide: true,
      silent: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NEXUS_USER_DATA: app.getPath('userData'),
        NEXUS_API_PORT: String(API_PORT)
      }
    })

    serverProcess.on('error', (err) => {
      console.error('Error al iniciar el backend:', err.message)
    })
    serverProcess.on('exit', (code) => {
      console.log('Backend finalizado (code:', code, ')')
      serverProcess = null
    })

    const ready = await waitForServer()
    if (!ready) {
      dialog.showErrorBox(
        'NexusMedia — Servidor no disponible',
        'El motor de contenido no respondió a tiempo. Reinicia la aplicación.'
      )
      return false
    }
    return true
  } catch (err) {
    console.error('No se pudo lanzar el backend:', err.message)
    dialog.showErrorBox('NexusMedia', `No se pudo iniciar el servidor:\n${err.message}`)
    return false
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      contextIsolation: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.session.on('will-download', (e, item) => e.preventDefault())

  mainWindow.maximize()
  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const dataPath = path.join(app.getPath('userData'), 'nexus_library.json')

const DEFAULT_DB = { favoritos: [], progreso: {}, historial: [] }

function initDatabase() {
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify(DEFAULT_DB, null, 2))
  }
}

const writeDB = (data) => fs.writeFileSync(dataPath, JSON.stringify(data, null, 2))

function readDB() {
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    if (!data || typeof data !== 'object') throw new Error('Formato inválido')
    if (!Array.isArray(data.favoritos)) data.favoritos = []
    if (!data.progreso || typeof data.progreso !== 'object') data.progreso = {}
    if (!Array.isArray(data.historial)) data.historial = []
    return data
  } catch (err) {
    console.error('Biblioteca corrupta, se restaura por defecto:', err.message)
    if (fs.existsSync(dataPath)) {
      try {
        fs.copyFileSync(dataPath, `${dataPath}.corrupt.${Date.now()}.bak`)
      } catch {
        /* ignorar backup */
      }
    }
    const fresh = { ...DEFAULT_DB, favoritos: [], progreso: {}, historial: [] }
    writeDB(fresh)
    return fresh
  }
}

export function setupIPC() {
  ipcMain.handle('get-library', readDB)

  ipcMain.handle('save-progress', (event, animeObj, urlEpisodio, tiempo, visto, duracion) => {
    if (!animeObj || !animeObj.url) {
      return readDB().historial || []
    }
    const db = readDB()
    if (tiempo === 0 && !visto) {
      db.historial = db.historial.filter((h) => h.url !== animeObj.url)
    } else {
      const entrada = { tiempo, visto }
      if (duracion > 0) entrada.duracion = duracion
      db.progreso[urlEpisodio] = entrada
      db.historial = db.historial.filter((h) => h.url !== animeObj.url)
      db.historial.unshift(animeObj)
      if (db.historial.length > 50) db.historial.pop()
    }
    writeDB(db)
    return db.historial
  })

  ipcMain.handle('clear-progress', (event, animeObj, urlsEpisodios = []) => {
    const db = readDB()
    if (Array.isArray(urlsEpisodios)) {
      urlsEpisodios.forEach((url) => {
        if (url) delete db.progreso[url]
      })
    }
    if (animeObj?.url) {
      db.historial = db.historial.filter((h) => h.url !== animeObj.url)
    }
    writeDB(db)
    return { historial: db.historial, progreso: db.progreso }
  })

  ipcMain.handle('toggle-favorite', (event, anime) => {
    if (!anime || !anime.url) return readDB().favoritos || []
    const db = readDB()
    const index = db.favoritos.findIndex((f) => f.url === anime.url)
    index === -1 ? db.favoritos.push(anime) : db.favoritos.splice(index, 1)
    writeDB(db)
    return db.favoritos
  })
}

app.whenReady().then(async () => {
  const serverOk = await manageServer()
  if (!serverOk) {
    app.quit()
    return
  }

  electronApp.setAppUserModelId('com.nexusmedia.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  setupIPC()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function detenerServidorBackend() {
  if (serverProcess && serverProcess.pid) {
    try {
      exec(`taskkill /pid ${serverProcess.pid} /t /f`)
    } catch (e) {
      try {
        serverProcess.kill()
      } catch (e2) {
        /* ignorar */
      }
    }
    serverProcess = null
  }
}

app.on('will-quit', detenerServidorBackend)
app.on('before-quit', detenerServidorBackend)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
