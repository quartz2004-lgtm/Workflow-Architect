/*
Copyright (C) 2026  quartz2004

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://gnu.org>.
*/

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, session, Tray, powerMonitor } from 'electron'
import { readFile } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RuntimeHost } from './runtime-host.cjs'
import { loadCredentials, type CredentialsHost } from './credentials-host.cjs'
import { loadKnowledge } from './knowledge-host.cjs'

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
let runtime: RuntimeHost | undefined
let credentials: CredentialsHost | undefined
let knowledge: ReturnType<typeof loadKnowledge> | undefined
let tray: Tray | undefined
let quitRequested = false
let exiting = false

function trusted(sender: Electron.WebContents, frame: Electron.WebFrameMain | null) {
  return !!window && sender === window.webContents && frame === sender.mainFrame && frame.url === entry
}

ipcMain.handle('workflow:credentials-request', (event, value: unknown) => {
  if (!trusted(event.sender, event.senderFrame)) throw new Error('Недоверенный отправитель credentials.')
  if (!credentials) return { ok: false, message: 'Защищённое хранилище недоступно. Перезапустите приложение.' }
  return credentials.handle(value)
})
ipcMain.handle('workflow:knowledge-request', (event, value: unknown) => {
  if (!trusted(event.sender, event.senderFrame)) throw new Error('Недоверенный отправитель знаний.')
  return knowledge?.handle(value) ?? { ok: false, message: 'Хранилище знаний недоступно. Перезапустите приложение.' }
})
for (const channel of ['workflow:runtime-request', 'workflow:runtime-state', 'workflow:runtime-reconnect']) ipcMain.handle(channel, async (event, value: unknown) => {
  if (!trusted(event.sender, event.senderFrame)) throw new Error('Недоверенный отправитель runtime.')
  if (!runtime) throw new Error('Runtime ещё не готов.')
  if (channel === 'workflow:runtime-state') return runtime.snapshot()
  if (channel === 'workflow:runtime-reconnect') return runtime.reconnect()
  try {
    if (value && typeof value === 'object' && 'kind' in value && (value.kind === 'submit' || value.kind === 'answer' || value.kind === 'ai' || value.kind === 'integrations')) credentials?.assertNoSecrets(value)
    return await runtime.request(value)
  } catch (error) {
    // Do not attach an unredacted native error as cause across the renderer boundary.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(credentials?.redact(error instanceof Error ? error.message : 'Ошибка runtime.') ?? 'Ошибка runtime.')
  }
})

async function finishQuit() {
  if (exiting) return
  exiting = true
  try { await runtime?.stop() }
  finally { tray?.destroy(); app.exit(0) }
}
function requestQuit() {
  quitRequested = true
  if (window && !window.isDestroyed()) window.close()
  else void finishQuit()
}
async function closeEditor() {
  try { await runtime?.closeWindow() }
  catch {
    closing = false; quitRequested = false
    dialog.showErrorBox('Фоновый сервис недоступен', 'Не удалось подтвердить остановку запусков без разрешения на фон. Окно оставлено открытым. Переподключитесь к runtime и повторите закрытие.')
    return
  }
  window?.destroy()
}
function updateTray() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Workflow Architect', click: () => { if (window) { window.show(); window.focus() } else void openWindow() } },
    { label: 'Автозапуск при входе в Windows', type: 'checkbox', enabled: app.isPackaged, checked: app.getLoginItemSettings().openAtLogin,
      click: item => { app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--background'] }); updateTray() } },
    { type: 'separator' },
    { label: 'Выйти и сохранить состояние запусков', click: requestQuit },
  ]))
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
  if (result.response === 1) void closeEditor()
  else quitRequested = false
}

ipcMain.on('workflow:ready', event => {
  if (trusted(event.sender, event.senderFrame)) rendererReady = true
})
ipcMain.on('workflow:close-result', (event, request: unknown, saved: unknown) => {
  if (!trusted(event.sender, event.senderFrame) || !pending || request !== pending) return
  clearTimeout(closeTimer)
  pending = undefined
  if (saved === true) void closeEditor()
  else void failedSave()
})

async function openWindow() {
  if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); return }
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
  current.on('closed', () => {
    // A new window can already exist when Windows finishes destroying the old one.
    if (window !== current) return
    clearTimeout(closeTimer); window = null
    // Also covers a renderer crash or a window destroyed before the save handshake.
    void runtime?.closeWindow().catch(() => {})
    if (quitRequested) void finishQuit()
  })
  try { await current.loadURL(entry) }
  catch (error) {
    dialog.showErrorBox('Workflow Architect', `Не удалось открыть редактор.\n${String(error)}`)
    current.destroy()
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  let shellReady = false, openRequested = false
  app.on('second-instance', () => {
    // A second launch can arrive while async vault/runtime initialization is still pending.
    openRequested = true
    if (shellReady) void openWindow()
  })
  void app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark'
    try { knowledge = loadKnowledge(app.getAppPath(), join(app.getPath('userData'), 'knowledge')) } catch { /* Editor remains available; IPC reports the storage error. */ }
    Menu.setApplicationMenu(null)
    try { credentials = await loadCredentials(app.getAppPath(), join(app.getPath('userData'), 'credentials')) }
    catch { /* No plaintext fallback. The editor and non-secret operations remain available. */ }
    runtime = new RuntimeHost(join(app.getAppPath(), 'runtime-dist', 'runtime.cjs'), join(app.getPath('userData'), 'runtime', 'jobs'), message => {
      if (window && !window.isDestroyed()) window.webContents.send('workflow:runtime-event', message)
    }, message => credentials?.redact(message) ?? message, (profileId, id) => {
      if (!credentials) return Promise.reject(new Error('Хранилище недоступно.'))
      return credentials.resolve(profileId, id)
    })
    try { await runtime.start() } catch { /* The editor remains available with a visible service error. */ }
    tray = new Tray(join(app.getAppPath(), 'desktop', 'assets', 'icon.ico'))
    tray.setToolTip('Workflow Architect — фоновое выполнение')
    tray.on('double-click', () => { void openWindow() })
    updateTray()
    powerMonitor.on('resume', () => { void runtime?.wake().catch(() => {}) })
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
    shellReady = true
    if (openRequested || !process.argv.includes('--background')) await openWindow()
  })
  app.on('window-all-closed', () => { /* The tray and allowed runtime jobs outlive the editor window. */ })
  app.on('before-quit', event => { if (!exiting) { event.preventDefault(); requestQuit() } })
}
