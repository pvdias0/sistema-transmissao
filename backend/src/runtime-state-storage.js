import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const runtimeDirectory = join(process.cwd(), 'runtime');
const stateFilePath = join(runtimeDirectory, 'state.json');
const mediaDirectory = join(runtimeDirectory, 'media');

async function ensureRuntimeDirectory() {
  await mkdir(runtimeDirectory, { recursive: true });
}

export function getRuntimeStateFilePath() {
  return stateFilePath;
}

export function createRuntimeStateStorage() {
  let writeQueue = Promise.resolve();
  let restoredFromDisk = false;
  let lastPersistedAt = null;

  async function persist(snapshot) {
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => {
        await ensureRuntimeDirectory();
        lastPersistedAt = new Date().toISOString();
        await writeFile(
          stateFilePath,
          JSON.stringify(
            {
              persistedAt: lastPersistedAt,
              ...snapshot
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
        const raw = await readFile(stateFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        restoredFromDisk = true;
        lastPersistedAt = parsed?.persistedAt || null;

        return {
          initialState: parsed,
          restoredFromDisk,
          persistedAt: lastPersistedAt
        };
      } catch (error) {
        if (error?.code === 'ENOENT') {
          restoredFromDisk = false;
          lastPersistedAt = null;
          return {
            initialState: null,
            restoredFromDisk,
            persistedAt: lastPersistedAt
          };
        }

        console.error('[runtime] Falha ao carregar estado persistido:', error);
        restoredFromDisk = false;
        lastPersistedAt = null;
        return {
          initialState: null,
          restoredFromDisk,
          persistedAt: lastPersistedAt
        };
      }
    },

    persist,

    getStatusMeta() {
      return {
        restoredFromDisk,
        persistedAt: lastPersistedAt
      };
    },

    async clearOperationalData() {
      await writeQueue.catch(() => undefined);

      await Promise.all([
        rm(stateFilePath, { force: true }),
        rm(mediaDirectory, { recursive: true, force: true })
      ]);

      await ensureRuntimeDirectory();
      lastPersistedAt = null;
    }
  };
}
