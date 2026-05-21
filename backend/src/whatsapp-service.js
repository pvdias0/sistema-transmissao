import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import whatsAppWeb from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsAppWeb;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '..');
const runtimeDir = join(backendRoot, 'runtime');
const authDir = join(backendRoot, '.wwebjs_auth');
const cacheDir = join(backendRoot, '.wwebjs_cache');
const execFileAsync = promisify(execFile);
const STALE_RUNTIME_ENTRIES = [
  'DevToolsActivePort',
  'lockfile',
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
  join('Default', 'LOCK')
];

function getBrowserConfig() {
  const executablePath = process.env.CHROME_EXECUTABLE_PATH?.trim();

  return {
    headless: true,
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  };
}

function parseBooleanEnvironment(value, defaultValue = false) {
  if (value == null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function firstDefinedValue(...values) {
  return values.find((value) => typeof value === 'string' && value.trim());
}

function normalizeWhatsAppId(value) {
  if (!value) {
    return '';
  }

  return String(value).trim().replace(/@.+$/, '');
}

function isGroupIdentifier(value) {
  return typeof value === 'string' && value.endsWith('@g.us');
}

function formatDisplayIdentity(value) {
  const normalizedValue = normalizeWhatsAppId(value);

  if (!normalizedValue) {
    return 'Nao informado';
  }

  return normalizedValue;
}

async function resolveProfilePhotoUrl(contact) {
  if (!contact || typeof contact.getProfilePicUrl !== 'function') {
    return null;
  }

  try {
    const url = await contact.getProfilePicUrl();
    return typeof url === 'string' && url.trim() ? url : null;
  } catch {
    return null;
  }
}

async function resolveMessageDisplayIdentity(message) {
  const fallbackAuthor =
    firstDefinedValue(message.notifyName, message._data?.notifyName, message._data?.from) ||
    'WhatsApp';
  const fallbackPhone = formatDisplayIdentity(message.author || message.from);

  try {
    const [chat, contact] = await Promise.all([
      typeof message.getChat === 'function' ? message.getChat() : Promise.resolve(null),
      typeof message.getContact === 'function' ? message.getContact() : Promise.resolve(null)
    ]);

    const chatId = chat?.id?._serialized || message.from || '';
    const participantId = message.author || message._data?.author || message.from || '';
    const isGroup = Boolean(chat?.isGroup) || isGroupIdentifier(chatId);
    const author =
      firstDefinedValue(
        contact?.pushname,
        contact?.name,
        contact?.shortName,
        contact?.number,
        message.notifyName,
        message._data?.notifyName
      ) || fallbackAuthor;

    const authorAvatarUrl = await resolveProfilePhotoUrl(contact);

    if (isGroup) {
      const groupName =
        firstDefinedValue(chat?.name, chat?.formattedTitle, normalizeWhatsAppId(chatId)) ||
        'Grupo';
      const participantDisplay = formatDisplayIdentity(participantId);

      return {
        author,
        phone: `${participantDisplay} | ${groupName}`,
        authorAvatarUrl
      };
    }

    return {
      author,
      phone: formatDisplayIdentity(message.from),
      authorAvatarUrl
    };
  } catch {
    return {
      author: fallbackAuthor,
      phone: fallbackPhone,
      authorAvatarUrl: null
    };
  }
}

export function createWhatsAppService({ store, mediaStorage }) {
  let client = null;
  let isInitializing = false;
  const autoConnectEnabled = parseBooleanEnvironment(process.env.WHATSAPP_AUTO_CONNECT, true);

  const state = {
    connection: 'idle',
    sessionName: process.env.WHATSAPP_SESSION_NAME || 'sistema-transmissao',
    qrCodeDataUrl: null,
    lastError: null,
    lastEventAt: null,
    account: null
  };

  function markState(nextConnection, extra = {}) {
    const previousConnection = state.connection;
    state.connection = nextConnection;
    state.lastEventAt = new Date().toISOString();
    Object.assign(state, extra);

    if (previousConnection !== nextConnection) {
      console.log(`[whatsapp] ${previousConnection} -> ${nextConnection}`);
    }
  }

  function getSnapshot() {
    return {
      connection: state.connection,
      sessionName: state.sessionName,
      qrCodeDataUrl: state.qrCodeDataUrl,
      lastError: state.lastError,
      lastEventAt: state.lastEventAt,
      account: state.account
    };
  }

  async function ensureRuntimeDirectories() {
    await Promise.all([
      mkdir(runtimeDir, { recursive: true }),
      mkdir(authDir, { recursive: true }),
      mkdir(cacheDir, { recursive: true })
    ]);
  }

  function getSessionDirectory() {
    return join(authDir, `session-${state.sessionName}`);
  }

  async function hasSavedSession() {
    try {
      await access(join(getSessionDirectory(), 'Default'));
      return true;
    } catch {
      return false;
    }
  }

  function normalizeErrorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
  }

  function isBrowserAlreadyRunningError(message) {
    return typeof message === 'string' && message.toLowerCase().includes('browser is already running');
  }

  async function clearSessionRuntimeArtifacts() {
    const sessionDirectory = getSessionDirectory();

    await Promise.all(
      STALE_RUNTIME_ENTRIES.map(async (entry) => {
        const target = join(sessionDirectory, entry);

        try {
          await rm(target, {
            force: true,
            recursive: true
          });
        } catch (error) {
          if (process.env.APP_ENV !== 'production') {
            console.warn(`[whatsapp] Falha ao limpar artefato residual: ${target}`, error);
          }
        }
      })
    );
  }

  async function clearSavedSession() {
    try {
      await rm(getSessionDirectory(), {
        force: true,
        recursive: true
      });
    } catch (error) {
      if (process.env.APP_ENV !== 'production') {
        console.warn('[whatsapp] Falha ao limpar sessao autenticada:', error);
      }
    }
  }

  async function findWindowsSessionBrowserProcessIds() {
    if (process.platform !== 'win32') {
      return [];
    }

    const sessionDirectory = getSessionDirectory().replace(/'/g, "''");
    const script = [
      'Get-CimInstance Win32_Process',
      " | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*" +
        sessionDirectory +
        "*' }",
      ' | Select-Object -ExpandProperty ProcessId'
    ].join('');

    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
        windowsHide: true
      });

      return stdout
        .split(/\r?\n/)
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isInteger(value) && value > 0);
    } catch (error) {
      if (process.env.APP_ENV !== 'production') {
        console.warn('[whatsapp] Falha ao listar processos residuais da sessao:', error);
      }

      return [];
    }
  }

  async function terminateSessionBrowserProcesses() {
    const processIds = await findWindowsSessionBrowserProcessIds();

    if (!processIds.length) {
      return 0;
    }

    await Promise.all(
      processIds.map(async (processId) => {
        try {
          await execFileAsync(
            'taskkill.exe',
            ['/PID', String(processId), '/T', '/F'],
            {
              windowsHide: true
            }
          );
        } catch (error) {
          if (process.env.APP_ENV !== 'production') {
            console.warn(`[whatsapp] Falha ao encerrar processo residual ${processId}:`, error);
          }
        }
      })
    );

    return processIds.length;
  }

  async function destroyClientInstance(instance = client) {
    if (!instance) {
      return;
    }

    try {
      await instance.destroy();
    } catch (error) {
      console.error('[whatsapp] Falha ao destruir cliente:', error);
    } finally {
      if (instance === client) {
        client = null;
      }
    }
  }

  async function initializeClientInstance({ allowRecovery }) {
    await ensureRuntimeDirectories();
    await terminateSessionBrowserProcesses();
    await clearSessionRuntimeArtifacts();

    const instance = new Client({
      authStrategy: new LocalAuth({
        clientId: state.sessionName,
        dataPath: authDir
      }),
      puppeteer: getBrowserConfig(),
      webVersionCache: {
        type: 'local',
        path: cacheDir
      }
    });

    client = instance;
    bindClientEvents(instance);

    try {
      await instance.initialize();
    } catch (error) {
      const lastError = normalizeErrorMessage(error, 'Falha ao inicializar sessao do WhatsApp.');

      await destroyClientInstance(instance);

      if (allowRecovery && isBrowserAlreadyRunningError(lastError)) {
        markState('recovering', {
          lastError: `${lastError} Tentando recuperar a sessao local...`
        });

        await terminateSessionBrowserProcesses();
        await clearSessionRuntimeArtifacts();
        await new Promise((resolve) => setTimeout(resolve, 600));

        return initializeClientInstance({ allowRecovery: false });
      }

      markState('error', {
        lastError
      });
    }
  }

  function bindClientEvents(instance) {
    instance.on('qr', async (qr) => {
      const qrCodeDataUrl = await QRCode.toDataURL(qr, {
        margin: 1,
        width: 280
      });

      markState('qr_ready', {
        qrCodeDataUrl,
        lastError: null
      });
    });

    instance.on('authenticated', () => {
      markState('authenticated', {
        lastError: null
      });
    });

    instance.on('ready', async () => {
      const info = await instance.info;

      markState('ready', {
        qrCodeDataUrl: null,
        lastError: null,
        account: info
          ? {
              wid: info.wid?._serialized || null,
              pushname: info.pushname || null,
              platform: info.platform || null
            }
          : null
      });
    });

    instance.on('auth_failure', (message) => {
      markState('auth_failure', {
        lastError: message || 'Falha de autenticacao do WhatsApp.'
      });
    });

    instance.on('disconnected', (reason) => {
      markState('disconnected', {
        qrCodeDataUrl: null,
        account: null,
        lastError: reason || 'Sessao do WhatsApp desconectada.'
      });
      void destroyClientInstance(instance);
    });

    instance.on('message', async (message) => {
      if (message.fromMe) {
        return;
      }

      const { author, phone, authorAvatarUrl } = await resolveMessageDisplayIdentity(message);
      const body = message.body?.trim() || '';

      if (message.type === 'chat') {
        if (!body) {
          return;
        }

        store.enqueueTextMessage({
          author,
          phone,
          authorAvatarUrl,
          content: body,
          source: 'whatsapp'
        });
        return;
      }

      if (message.type === 'image' && message.hasMedia) {
        try {
          const downloadedMedia = await message.downloadMedia();

          if (!downloadedMedia?.data || !downloadedMedia?.mimetype?.startsWith('image/')) {
            return;
          }

          const media = await mediaStorage.saveBase64Media({
            mimeType: downloadedMedia.mimetype,
            base64Data: downloadedMedia.data
          });

          store.enqueueImageMessage({
            author,
            phone,
            authorAvatarUrl,
            content: body,
            source: 'whatsapp',
            media
          });
        } catch (error) {
          markState('error', {
            lastError:
              error instanceof Error
                ? `Falha ao baixar imagem do WhatsApp: ${error.message}`
                : 'Falha ao baixar imagem do WhatsApp.'
          });
        }
        return;
      }

      if ((message.type === 'audio' || message.type === 'ptt') && message.hasMedia) {
        try {
          const downloadedMedia = await message.downloadMedia();

          if (!downloadedMedia?.data || !downloadedMedia?.mimetype?.startsWith('audio/')) {
            return;
          }

          const media = await mediaStorage.saveBase64Media({
            mimeType: downloadedMedia.mimetype,
            base64Data: downloadedMedia.data
          });

          store.enqueueAudioMessage({
            author,
            phone,
            authorAvatarUrl,
            content: body,
            source: 'whatsapp',
            media
          });
        } catch (error) {
          markState('error', {
            lastError:
              error instanceof Error
                ? `Falha ao baixar audio do WhatsApp: ${error.message}`
                : 'Falha ao baixar audio do WhatsApp.'
          });
        }
        return;
      }

      if (message.type === 'video' && message.hasMedia) {
        try {
          const downloadedMedia = await message.downloadMedia();

          if (!downloadedMedia?.data || !downloadedMedia?.mimetype?.startsWith('video/')) {
            return;
          }

          const media = await mediaStorage.saveBase64Media({
            mimeType: downloadedMedia.mimetype,
            base64Data: downloadedMedia.data
          });

          store.enqueueVideoMessage({
            author,
            phone,
            authorAvatarUrl,
            content: body,
            source: 'whatsapp',
            media
          });
        } catch (error) {
          markState('error', {
            lastError:
              error instanceof Error
                ? `Falha ao baixar video do WhatsApp: ${error.message}`
                : 'Falha ao baixar video do WhatsApp.'
          });
        }
      }
    });
  }

  return {
    getSnapshot,

    async getStartupMeta() {
      return {
        autoConnectEnabled,
        hasSavedSession: await hasSavedSession()
      };
    },

    async connect() {
      if (client || isInitializing) {
        return getSnapshot();
      }

      isInitializing = true;
      markState('starting', {
        lastError: null
      });

      try {
        void initializeClientInstance({ allowRecovery: true })
          .finally(() => {
            isInitializing = false;
          });

        return getSnapshot();
      } catch (error) {
        client = null;
        isInitializing = false;
        markState('error', {
          lastError: error instanceof Error ? error.message : 'Falha ao iniciar WhatsApp.'
        });
        return getSnapshot();
      }
    },

    async bootstrap() {
      await ensureRuntimeDirectories();

      if (!autoConnectEnabled) {
        return {
          attempted: false,
          reason: 'auto_connect_disabled'
        };
      }

      if (!(await hasSavedSession())) {
        return {
          attempted: false,
          reason: 'no_saved_session'
        };
      }

      await this.connect();

      return {
        attempted: true,
        reason: 'saved_session_detected'
      };
    },

    async resetRuntime() {
      isInitializing = false;
      await destroyClientInstance();
      await terminateSessionBrowserProcesses();
      await clearSessionRuntimeArtifacts();

      markState('idle', {
        qrCodeDataUrl: null,
        lastError: null,
        account: null
      });

      return getSnapshot();
    },

    async logout() {
      isInitializing = false;

      if (client && typeof client.logout === 'function') {
        try {
          await client.logout();
        } catch (error) {
          if (process.env.APP_ENV !== 'production') {
            console.warn('[whatsapp] Falha ao executar logout da sessao:', error);
          }
        }
      }

      await destroyClientInstance();
      await terminateSessionBrowserProcesses();
      await clearSessionRuntimeArtifacts();
      await clearSavedSession();

      markState('idle', {
        qrCodeDataUrl: null,
        lastError: null,
        account: null
      });

      return getSnapshot();
    },

    async shutdown() {
      await destroyClientInstance();
      await clearSessionRuntimeArtifacts();
    }
  };
}
