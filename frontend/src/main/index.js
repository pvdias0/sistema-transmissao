import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/logo-pulso-icon.png?asset'

const backendBaseUrl = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:47831'
const workspaceRoot = join(__dirname, '../../..')
const backendRoot = join(workspaceRoot, 'backend')
const backendEntryPath = join(backendRoot, 'src', 'server.js')

let backendChildProcess = null
let isBackendStarting = false
let isAppQuitting = false
const BACKEND_STARTUP_TIMEOUT_MS = 8000
const BACKEND_STARTUP_POLL_MS = 350
const execFileAsync = promisify(execFile)
let backendHostOverride = null

async function isBackendReachable() {
  try {
    const response = await fetch(new URL('/health', `${backendBaseUrl}/`))
    return response.ok
  } catch {
    return false
  }
}

async function waitForBackendReachable(timeoutMs = BACKEND_STARTUP_TIMEOUT_MS) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await isBackendReachable()) {
      return true
    }

    await new Promise((resolve) => {
      setTimeout(resolve, BACKEND_STARTUP_POLL_MS)
    })
  }

  return false
}

function attachBackendLogging(childProcess) {
  childProcess.stdout?.on('data', (chunk) => {
    const text = chunk.toString().trim()

    if (text) {
      console.log(`[backend] ${text}`)
    }
  })

  childProcess.stderr?.on('data', (chunk) => {
    const text = chunk.toString().trim()

    if (text) {
      console.error(`[backend] ${text}`)
    }
  })
}

function scheduleBackendRestart() {
  if (isAppQuitting || process.env.BACKEND_BASE_URL) {
    return
  }

  setTimeout(() => {
    void ensureBackendRunning()
  }, 1200)
}

async function ensureBackendRunning() {
  if (process.env.BACKEND_BASE_URL) {
    await waitForBackendReachable(2500)
    return
  }

  if (backendChildProcess || isBackendStarting) {
    return
  }

  if (await isBackendReachable()) {
    return
  }

  if (!existsSync(backendEntryPath)) {
    console.warn(`Backend local nao encontrado em ${backendEntryPath}`)
    return
  }

  isBackendStarting = true

  const env = { ...process.env }

  if (backendHostOverride) {
    env.HOST = backendHostOverride
  }

  const childProcess = spawn('node', ['src/server.js'], {
    cwd: backendRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env
  })

  backendChildProcess = childProcess
  attachBackendLogging(childProcess)

  childProcess.once('exit', (code, signal) => {
    console.log(`[backend] processo encerrado (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
    backendChildProcess = null

    if (!isAppQuitting) {
      scheduleBackendRestart()
    }
  })

  childProcess.once('spawn', () => {
    isBackendStarting = false
  })

  childProcess.once('error', (error) => {
    console.error('[backend] Falha ao iniciar backend local:', error)
    isBackendStarting = false
    backendChildProcess = null
    scheduleBackendRestart()
  })

  setTimeout(() => {
    isBackendStarting = false
  }, 1200)

  await waitForBackendReachable()
}

async function stopManagedBackend() {
  if (!backendChildProcess) {
    return
  }

  const processToStop = backendChildProcess
  backendChildProcess = null

  processToStop.kill('SIGTERM')
}

async function requestBackend(pathname) {
  const target = new URL(pathname, `${backendBaseUrl}/`)

  const response = await fetch(target, {
    headers: {
      accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Backend respondeu ${response.status}`)
  }

  return response.json()
}

async function requestBackendWithOptions(pathname, options = {}) {
  const target = new URL(pathname, `${backendBaseUrl}/`)
  const response = await fetch(target, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const hasJson = response.headers.get('content-type')?.includes('application/json')
  const payload = hasJson ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.error || `Backend respondeu ${response.status}`)
  }

  return payload
}

function encodePowerShellCommand(command) {
  return Buffer.from(command, 'utf16le').toString('base64')
}

async function runElevatedPowerShell(command) {
  const encoded = encodePowerShellCommand(command)
  const psCommand = `Start-Process -FilePath "powershell" -Verb RunAs -ArgumentList "-NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}" -Wait -PassThru | ForEach-Object { $_.ExitCode }`
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psCommand], {
    windowsHide: true
  })
  const exitCode = Number.parseInt(String(stdout || '').trim(), 10)
  return Number.isInteger(exitCode) ? exitCode : 0
}

async function restartBackendWithHost(host) {
  if (process.env.BACKEND_BASE_URL) {
    return false
  }

  backendHostOverride = host
  await stopManagedBackend()
  await new Promise((resolve) => setTimeout(resolve, 800))
  await ensureBackendRunning()
  return true
}

async function enableNetworkAccessRule(port) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Disponivel apenas no Windows.' }
  }

  if (!Number.isInteger(port) || port <= 0) {
    return { ok: false, error: 'Porta do backend invalida.' }
  }

  const ruleName = `Sistema Transmissao (porta ${port})`
  const firewallCommand =
    `netsh advfirewall firewall delete rule name="${ruleName}" | Out-Null; ` +
    `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port} profile=private`

  try {
    const exitCode = await runElevatedPowerShell(firewallCommand)

    if (exitCode !== 0) {
      return { ok: false, error: 'Falha ao criar regra no firewall.' }
    }

    const restarted = await restartBackendWithHost('0.0.0.0')
    return {
      ok: true,
      data: {
        restarted
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const isCanceled = message.toLowerCase().includes('canceled') || message.includes('cancel')
    return {
      ok: false,
      error: isCanceled
        ? 'Permissao de administrador negada.'
        : 'Falha ao solicitar permissao do firewall.'
    }
  }
}

async function disableNetworkAccessRule(port) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Disponivel apenas no Windows.' }
  }

  if (!Number.isInteger(port) || port <= 0) {
    return { ok: false, error: 'Porta do backend invalida.' }
  }

  const ruleName = `Sistema Transmissao (porta ${port})`
  const firewallCommand = `netsh advfirewall firewall delete rule name="${ruleName}" | Out-Null`

  try {
    const exitCode = await runElevatedPowerShell(firewallCommand)

    if (exitCode !== 0) {
      return { ok: false, error: 'Falha ao remover regra do firewall.' }
    }

    const restarted = await restartBackendWithHost(null)
    return {
      ok: true,
      data: {
        restarted
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const isCanceled = message.toLowerCase().includes('canceled') || message.includes('cancel')
    return {
      ok: false,
      error: isCanceled
        ? 'Permissao de administrador negada.'
        : 'Falha ao solicitar remocao da regra no firewall.'
    }
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers() {
  ipcMain.removeHandler('system:get-config')
  ipcMain.removeHandler('system:get-shell-info')
  ipcMain.removeHandler('backend:get-health')
  ipcMain.removeHandler('backend:get-status')
  ipcMain.removeHandler('backend:get-moderation-state')
  ipcMain.removeHandler('backend:cleanup')
  ipcMain.removeHandler('system:enable-network-access')
  ipcMain.removeHandler('system:disable-network-access')
  ipcMain.removeHandler('overlay:update-settings')
  ipcMain.removeHandler('backend:create-test-message')
  ipcMain.removeHandler('backend:approve-item')
  ipcMain.removeHandler('backend:reject-item')
  ipcMain.removeHandler('backend:set-live-item')
  ipcMain.removeHandler('backend:clear-live-item')
  ipcMain.removeHandler('media:send-command')
  ipcMain.removeHandler('whatsapp:get-status')
  ipcMain.removeHandler('whatsapp:connect')
  ipcMain.removeHandler('whatsapp:reset-runtime')
  ipcMain.removeHandler('whatsapp:logout')
  ipcMain.removeHandler('polls:get-active')
  ipcMain.removeHandler('polls:create')
  ipcMain.removeHandler('polls:close')

  ipcMain.handle('system:get-config', () => ({
    backendBaseUrl
  }))

  ipcMain.handle('system:get-shell-info', () => ({
    appName: app.getName(),
    appVersion: app.getVersion(),
    platform: process.platform,
    isDev: is.dev
  }))

  ipcMain.handle('system:enable-network-access', async (_event, payload) => {
    return enableNetworkAccessRule(Number(payload?.port))
  })

  ipcMain.handle('system:disable-network-access', async (_event, payload) => {
    return disableNetworkAccessRule(Number(payload?.port))
  })

  ipcMain.handle('backend:get-health', async () => {
    try {
      return {
        ok: true,
        data: await requestBackend('/health')
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao consultar backend'
      }
    }
  })

  ipcMain.handle('backend:get-status', async () => {
    try {
      return {
        ok: true,
        data: await requestBackend('/api/system/status')
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao consultar backend'
      }
    }
  })

  ipcMain.handle('backend:get-moderation-state', async () => {
    try {
      return {
        ok: true,
        data: await requestBackend('/api/moderation/state')
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao consultar moderacao'
      }
    }
  })

  ipcMain.handle('backend:cleanup', async () => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/system/cleanup', {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao limpar dados operacionais'
      }
    }
  })

  ipcMain.handle('overlay:update-settings', async (_event, payload) => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/overlay/settings', {
          method: 'POST',
          body: payload
        })
      }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Falha ao atualizar configuracoes do overlay'
      }
    }
  })

  ipcMain.handle('backend:create-test-message', async (_event, payload) => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/moderation/messages', {
          method: 'POST',
          body: payload
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao criar mensagem'
      }
    }
  })

  ipcMain.handle('backend:approve-item', async (_event, id) => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions(`/api/moderation/items/${id}/approve`, {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao aprovar item'
      }
    }
  })

  ipcMain.handle('backend:reject-item', async (_event, id) => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions(`/api/moderation/items/${id}/reject`, {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao rejeitar item'
      }
    }
  })

  ipcMain.handle('backend:set-live-item', async (_event, id) => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions(`/api/moderation/items/${id}/live`, {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao enviar item para o ar'
      }
    }
  })

  ipcMain.handle('backend:clear-live-item', async () => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/moderation/live/clear', {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao limpar item no ar'
      }
    }
  })

  ipcMain.handle('media:send-command', async (_event, payload) => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/media/transport/command', {
          method: 'POST',
          body: payload
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao controlar audio ou video'
      }
    }
  })

  ipcMain.handle('whatsapp:get-status', async () => {
    try {
      return {
        ok: true,
        data: await requestBackend('/api/whatsapp/status')
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao consultar WhatsApp'
      }
    }
  })

  ipcMain.handle('whatsapp:connect', async () => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/whatsapp/connect', {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao iniciar sessao do WhatsApp'
      }
    }
  })

  ipcMain.handle('whatsapp:reset-runtime', async () => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/whatsapp/reset-runtime', {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao recuperar sessao do WhatsApp'
      }
    }
  })

  ipcMain.handle('whatsapp:logout', async () => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/whatsapp/logout', {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao desconectar WhatsApp'
      }
    }
  })

  ipcMain.handle('polls:get-active', async () => {
    try {
      return {
        ok: true,
        data: await requestBackend('/api/polls/active')
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao consultar enquete'
      }
    }
  })

  ipcMain.handle('polls:create', async (_event, payload) => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/polls', {
          method: 'POST',
          body: payload
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao criar enquete'
      }
    }
  })

  ipcMain.handle('polls:close', async () => {
    try {
      return {
        ok: true,
        data: await requestBackendWithOptions('/api/polls/close', {
          method: 'POST'
        })
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao encerrar enquete'
      }
    }
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await ensureBackendRunning()
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isAppQuitting = true
  void stopManagedBackend()
})
