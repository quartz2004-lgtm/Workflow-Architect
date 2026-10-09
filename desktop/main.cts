import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, session } from 'electron'
import { readFile } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, extname } from 'node:path'
import { randomUUID } from 'node:crypto'

const origin = 'workflow://app'
const entry = `${origin}/index.html`
protocol.registerSchemesAsPrivileged([{ scheme: 'workflow', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
app.setName('Workflow Architect')
app.setAppUserModelId('com.workflowarchitect.desktop')

let window: BrowserWindow | null = null
let rendererReady = false
let closing = false
let pending: string | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined

function trusted(sender: Electron.WebContents, frame: Electron.WebFrameMain | null) {
  return !!window && sender === window.webContents && frame === sender.mainFrame && frame.url === entry
}

async function failedSave() {
  pending = undefined
  clearTimeout(closeTimer)
  if (!window || window.isDestroyed()) return
  const result = await dialog.showMessageBox(window, {
    type: 'warning', title: 'Проект ещё не сохранён',
    message: 'Не удалось подтвердить сохранение проекта.',
    detail: 'Вернитесь в редактор и повторите сохранение или экспортируйте проект. При выходе последние изменения могут быть потеряны.',
    buttons: ['Вернуться в редактор', 'Выйти без сохранения'], defaultId: 0, cancelId: 0, noLink: true,
  })
  closing = false
  if (result.response === 1) window?.destroy()
}

ipcMain.on('workflow:ready', event => {
  if (trusted(event.sender, event.senderFrame)) rendererReady = true
})
ipcMain.on('workflow:close-result', (event, request: unknown, saved: unknown) => {
  if (!trusted(event.sender, event.senderFrame) || !pending || request !== pending) return
  clearTimeout(closeTimer)
  pending = undefined
  if (saved === true) window?.destroy()
  else void failedSave()
})

async function openWindow() {
  rendererReady = false
  closing = false
  window = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1000, minHeight: 700,
    title: 'Workflow Architect', backgroundColor: '#101216', show: false,
    icon: join(app.getAppPath(), 'desktop', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), contextIsolation: true,
      sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false,
    },
  })
  const current = window
  current.removeMenu()
  current.once('ready-to-show', () => current.show())
  current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  current.webContents.on('will-navigate', (event, url) => { if (url !== entry) event.preventDefault() })
  current.webContents.on('will-attach-webview', event => event.preventDefault())
  current.webContents.on('did-start-loading', () => { rendererReady = false })
  current.webContents.on('render-process-gone', () => { rendererReady = false })
  current.on('page-title-updated', event => event.preventDefault())
  current.on('close', event => {
    if (!rendererReady) return
    event.preventDefault()
    if (closing) return
    closing = true
    pending = randomUUID()
    current.webContents.send('workflow:before-close', pending)
    closeTimer = setTimeout(() => { void failedSave() }, 10_000)
  })
  current.on('closed', () => { clearTimeout(closeTimer); window = null })
  try { await current.loadURL(entry) }
  catch (error) {
    dialog.showErrorBox('Workflow Architect', `Не удалось открыть редактор.\n${String(error)}`)
    current.destroy()
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.show(); window?.focus()
  })
  void app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark'
    Menu.setApplicationMenu(null)
    const root = resolve(app.getAppPath(), 'dist')
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
    const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    protocol.handle('workflow', async request => {
      try {
        const url = new URL(request.url)
        if (url.host !== 'app' || request.method !== 'GET') return new Response(null, { status: 403 })
        const path = resolve(root, `.${decodeURIComponent(url.pathname) === '/' ? '/index.html' : decodeURIComponent(url.pathname)}`)
        const local = relative(root, path)
        if (local.startsWith('..') || isAbsolute(local)) return new Response(null, { status: 403 })
        return new Response(await readFile(path), { headers: { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' } })
      } catch { return new Response('Not found', { status: 404 }) }
    })
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !details.url.startsWith(`${origin}/`) && !details.url.startsWith(`blob:${origin}/`) && !details.url.startsWith('data:') })
    })
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: 'Сохранить файл', defaultPath: join(app.getPath('documents'), item.getFilename()) })
      item.once('done', (_event, state) => {
        if (state === 'interrupted') dialog.showErrorBox('Экспорт не сохранён', 'Не удалось записать файл. Выберите другую папку и повторите экспорт.')
      })
    })
    await openWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
