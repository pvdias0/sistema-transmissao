import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const runtimeDirectory = join(process.cwd(), 'runtime');
const settingsFilePath = join(runtimeDirectory, 'overlay-settings.json');

const DEFAULT_SETTINGS = {
  message: {
    fontSize: 32
  },
  poll: {
    fontSize: 24
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

function normalizeSettings(input = {}) {
  return {
    message: {
      fontSize: normalizeFontSize(input?.message?.fontSize, DEFAULT_SETTINGS.message.fontSize)
    },
    poll: {
      fontSize: normalizeFontSize(input?.poll?.fontSize, DEFAULT_SETTINGS.poll.fontSize)
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
