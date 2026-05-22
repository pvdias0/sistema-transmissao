import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '..');
const backendDataRoot = process.env.BACKEND_DATA_ROOT?.trim() || backendRoot;
const runtimeDirectory = join(backendDataRoot, 'runtime');
const licenseStateFilePath = join(runtimeDirectory, 'license-state.json');

function createDefaultState() {
  return {
    machineId: null,
    licenseKey: null,
    session: null,
    lastValidatedOnlineAt: null,
    lastValidationAttemptAt: null,
    lastError: null
  };
}

function normalizeState(value) {
  const fallback = createDefaultState();

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  return {
    machineId: typeof value.machineId === 'string' && value.machineId.trim() ? value.machineId : null,
    licenseKey:
      typeof value.licenseKey === 'string' && value.licenseKey.trim() ? value.licenseKey : null,
    session: value.session && typeof value.session === 'object' ? value.session : null,
    lastValidatedOnlineAt:
      typeof value.lastValidatedOnlineAt === 'string' && value.lastValidatedOnlineAt.trim()
        ? value.lastValidatedOnlineAt
        : null,
    lastValidationAttemptAt:
      typeof value.lastValidationAttemptAt === 'string' && value.lastValidationAttemptAt.trim()
        ? value.lastValidationAttemptAt
        : null,
    lastError: typeof value.lastError === 'string' && value.lastError.trim() ? value.lastError : null
  };
}

export function getLicenseStateFilePath() {
  return licenseStateFilePath;
}

export function createLicenseStateStorage() {
  return {
    async load() {
      try {
        const rawContent = await readFile(licenseStateFilePath, 'utf8');
        return normalizeState(JSON.parse(rawContent));
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return createDefaultState();
        }

        throw error;
      }
    },

    async persist(nextState) {
      await mkdir(runtimeDirectory, { recursive: true });
      const serialized = JSON.stringify(normalizeState(nextState), null, 2);
      await writeFile(licenseStateFilePath, serialized, 'utf8');
    }
  };
}
