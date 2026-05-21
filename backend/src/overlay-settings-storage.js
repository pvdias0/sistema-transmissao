import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const runtimeDirectory = join(process.cwd(), 'runtime');
const settingsFilePath = join(runtimeDirectory, 'overlay-settings.json');

const DEFAULT_SETTINGS = {
  canvas: {
    enabled: false,
    backgroundColor: '#0e171c',
    backgroundImageUrl: ''
  },
  message: {
    fontSize: 32,
    fontFamily: 'Segoe UI',
    textColor: '#f7fbfb',
    accentColor: '#8ef2cf',
    backgroundColor: '#101a1f',
    backgroundImageUrl: ''
  },
  poll: {
    fontSize: 24,
    fontFamily: 'Segoe UI',
    textColor: '#f7fbfb',
    accentColor: '#8ef2cf',
    backgroundColor: '#0e1820',
    backgroundImageUrl: ''
  }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeFontSize(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return clamp(parsed, 18, 56);
}

function normalizeFontFamily(value, fallback) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 80);
}

function normalizeColor(value, fallback) {
  const normalized = String(value || '').trim();

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }

  return fallback;
}

function normalizeBackgroundImageUrl(value) {
  const normalized = String(value || '').trim();
  return normalized.slice(0, 500);
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

function normalizeSettings(input = {}) {
  return {
    canvas: {
      enabled: normalizeBoolean(input?.canvas?.enabled, DEFAULT_SETTINGS.canvas.enabled),
      backgroundColor: normalizeColor(
        input?.canvas?.backgroundColor,
        DEFAULT_SETTINGS.canvas.backgroundColor
      ),
      backgroundImageUrl: normalizeBackgroundImageUrl(input?.canvas?.backgroundImageUrl)
    },
    message: {
      fontSize: normalizeFontSize(input?.message?.fontSize, DEFAULT_SETTINGS.message.fontSize),
      fontFamily: normalizeFontFamily(
        input?.message?.fontFamily,
        DEFAULT_SETTINGS.message.fontFamily
      ),
      textColor: normalizeColor(input?.message?.textColor, DEFAULT_SETTINGS.message.textColor),
      accentColor: normalizeColor(
        input?.message?.accentColor,
        DEFAULT_SETTINGS.message.accentColor
      ),
      backgroundColor: normalizeColor(
        input?.message?.backgroundColor,
        DEFAULT_SETTINGS.message.backgroundColor
      ),
      backgroundImageUrl: normalizeBackgroundImageUrl(input?.message?.backgroundImageUrl)
    },
    poll: {
      fontSize: normalizeFontSize(input?.poll?.fontSize, DEFAULT_SETTINGS.poll.fontSize),
      fontFamily: normalizeFontFamily(input?.poll?.fontFamily, DEFAULT_SETTINGS.poll.fontFamily),
      textColor: normalizeColor(input?.poll?.textColor, DEFAULT_SETTINGS.poll.textColor),
      accentColor: normalizeColor(input?.poll?.accentColor, DEFAULT_SETTINGS.poll.accentColor),
      backgroundColor: normalizeColor(
        input?.poll?.backgroundColor,
        DEFAULT_SETTINGS.poll.backgroundColor
      ),
      backgroundImageUrl: normalizeBackgroundImageUrl(input?.poll?.backgroundImageUrl)
    }
  };
}

async function ensureRuntimeDirectory() {
  await mkdir(runtimeDirectory, { recursive: true });
}

export function createOverlaySettingsStorage() {
  let currentSettings = normalizeSettings();
  let writeQueue = Promise.resolve();

  async function persist(settings) {
    currentSettings = normalizeSettings(settings);

    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => {
        await ensureRuntimeDirectory();
        await writeFile(
          settingsFilePath,
          JSON.stringify(
            {
              savedAt: new Date().toISOString(),
              settings: currentSettings
            },
            null,
            2
          ),
          'utf8'
        );
      });

    return writeQueue;
  }

  return {
    async load() {
      try {
        const raw = await readFile(settingsFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        currentSettings = normalizeSettings(parsed?.settings);
        return currentSettings;
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          console.error('[overlay-settings] Falha ao carregar configuracoes:', error);
        }

        currentSettings = normalizeSettings();
        return currentSettings;
      }
    },

    getSnapshot() {
      return normalizeSettings(currentSettings);
    },

    async update(partialSettings = {}) {
      const nextSettings = normalizeSettings({
        ...currentSettings,
        ...partialSettings,
        canvas: {
          ...currentSettings.canvas,
          ...partialSettings.canvas
        },
        message: {
          ...currentSettings.message,
          ...partialSettings.message
        },
        poll: {
          ...currentSettings.poll,
          ...partialSettings.poll
        }
      });

      await persist(nextSettings);
      return this.getSnapshot();
    }
  };
}
