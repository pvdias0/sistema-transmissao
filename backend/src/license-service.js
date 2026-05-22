import crypto from 'node:crypto';
import os from 'node:os';
import { licenseConfig } from './config.js';

function nowIso() {
  return new Date().toISOString();
}

function createBaseSnapshot() {
  return {
    configured: Boolean(licenseConfig.apiBaseUrl),
    accessAllowed: false,
    status: licenseConfig.apiBaseUrl ? 'locked' : 'unconfigured',
    reason: licenseConfig.apiBaseUrl ? 'license_required' : 'license_server_unconfigured',
    machineId: null,
    deviceName: `${os.hostname()} (${process.platform})`,
    appVersion: licenseConfig.appVersion,
    license: null,
    activation: null,
    lease: null,
    lastValidatedOnlineAt: null,
    lastValidationAttemptAt: null,
    offlineGraceExpiresAt: null,
    error: licenseConfig.apiBaseUrl ? null : 'Servidor de licenças não configurado neste app.'
  };
}

function normalizeLicenseKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }

  const nextDate = new Date(value);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
}

function getOfflineGraceExpiry(sessionState) {
  const fallbackDate =
    parseIsoDate(sessionState.lastValidatedOnlineAt) ||
    parseIsoDate(sessionState.session?.activation?.lastValidatedAt) ||
    parseIsoDate(sessionState.session?.activation?.activatedAt);

  if (!fallbackDate) {
    return null;
  }

  const graceMs = licenseConfig.offlineGraceHours * 60 * 60 * 1000;
  const graceLimit = new Date(fallbackDate.getTime() + graceMs);
  const leaseExpiry = parseIsoDate(sessionState.session?.lease?.expiresAt);

  if (!leaseExpiry) {
    return graceLimit;
  }

  return leaseExpiry.getTime() < graceLimit.getTime() ? leaseExpiry : graceLimit;
}

function canUseOfflineCache(sessionState) {
  const offlineGraceExpiry = getOfflineGraceExpiry(sessionState);

  if (!offlineGraceExpiry) {
    return {
      allowed: false,
      offlineGraceExpiresAt: null
    };
  }

  return {
    allowed: offlineGraceExpiry.getTime() >= Date.now(),
    offlineGraceExpiresAt: offlineGraceExpiry.toISOString()
  };
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestLicenseApi(pathname, payload) {
  const response = await fetch(new URL(pathname, `${licenseConfig.apiBaseUrl}/`), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const error = new Error(data?.error || `Servidor de licenças respondeu ${response.status}.`);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function isConnectivityFailure(error) {
  return !Number.isInteger(error?.statusCode);
}

export function createLicenseService({ storage }) {
  let persistedState = null;
  let snapshot = createBaseSnapshot();

  async function persistState(nextState) {
    persistedState = {
      machineId: nextState.machineId,
      licenseKey: nextState.licenseKey,
      session: nextState.session,
      lastValidatedOnlineAt: nextState.lastValidatedOnlineAt,
      lastValidationAttemptAt: nextState.lastValidationAttemptAt,
      lastError: nextState.lastError
    };

    await storage.persist(persistedState);
  }

  function applyState(partialState) {
    snapshot = {
      ...snapshot,
      ...partialState
    };

    return getSnapshot();
  }

  function getSnapshot() {
    return {
      ...snapshot
    };
  }

  function isAccessAllowed() {
    return snapshot.accessAllowed;
  }

  async function ensureMachineIdentity() {
    if (!persistedState.machineId) {
      persistedState.machineId = crypto.randomUUID();
      await persistState(persistedState);
    }

    applyState({
      machineId: persistedState.machineId
    });
  }

  async function applyRemoteLease({ licenseKey, responsePayload }) {
    const nextState = {
      ...persistedState,
      machineId: persistedState.machineId,
      licenseKey: normalizeLicenseKey(licenseKey),
      session: {
        license: responsePayload.license,
        activation: responsePayload.activation,
        leaseToken: responsePayload.leaseToken,
        lease: responsePayload.lease
      },
      lastValidatedOnlineAt: nowIso(),
      lastValidationAttemptAt: nowIso(),
      lastError: null
    };

    await persistState(nextState);

    applyState({
      configured: true,
      accessAllowed: true,
      status: 'active',
      reason: 'validated_online',
      machineId: nextState.machineId,
      license: nextState.session.license,
      activation: nextState.session.activation,
      lease: nextState.session.lease,
      lastValidatedOnlineAt: nextState.lastValidatedOnlineAt,
      lastValidationAttemptAt: nextState.lastValidationAttemptAt,
      offlineGraceExpiresAt: getOfflineGraceExpiry(nextState)?.toISOString() || null,
      error: null
    });
  }

  async function applyOfflineCache(errorMessage) {
    const offlineUsage = canUseOfflineCache(persistedState);

    if (!offlineUsage.allowed || !persistedState.session) {
      applyState({
        configured: true,
        accessAllowed: false,
        status: 'locked',
        reason: 'offline_cache_expired',
        license: persistedState.session?.license || null,
        activation: persistedState.session?.activation || null,
        lease: persistedState.session?.lease || null,
        lastValidatedOnlineAt: persistedState.lastValidatedOnlineAt,
        lastValidationAttemptAt: persistedState.lastValidationAttemptAt,
        offlineGraceExpiresAt: offlineUsage.offlineGraceExpiresAt,
        error: errorMessage
      });
      return false;
    }

    applyState({
      configured: true,
      accessAllowed: true,
      status: 'offline_cache',
      reason: 'using_local_cache',
      license: persistedState.session.license,
      activation: persistedState.session.activation,
      lease: persistedState.session.lease,
      lastValidatedOnlineAt: persistedState.lastValidatedOnlineAt,
      lastValidationAttemptAt: persistedState.lastValidationAttemptAt,
      offlineGraceExpiresAt: offlineUsage.offlineGraceExpiresAt,
      error: errorMessage
    });

    return true;
  }

  async function clearSession({ reason, error = null }) {
    const nextState = {
      ...persistedState,
      licenseKey: null,
      session: null,
      lastValidationAttemptAt: nowIso(),
      lastError: error
    };

    await persistState(nextState);

    applyState({
      configured: Boolean(licenseConfig.apiBaseUrl),
      accessAllowed: false,
      status: licenseConfig.apiBaseUrl ? 'locked' : 'unconfigured',
      reason,
      machineId: nextState.machineId,
      license: null,
      activation: null,
      lease: null,
      lastValidatedOnlineAt: nextState.lastValidatedOnlineAt,
      lastValidationAttemptAt: nextState.lastValidationAttemptAt,
      offlineGraceExpiresAt: null,
      error
    });
  }

  async function bootstrap() {
    persistedState = await storage.load();
    applyState(createBaseSnapshot());
    await ensureMachineIdentity();

    if (!licenseConfig.apiBaseUrl) {
      return getSnapshot();
    }

    if (!persistedState.licenseKey || !persistedState.session) {
      applyState({
        configured: true,
        accessAllowed: false,
        status: 'locked',
        reason: 'license_required',
        lastValidatedOnlineAt: persistedState.lastValidatedOnlineAt,
        lastValidationAttemptAt: persistedState.lastValidationAttemptAt,
        offlineGraceExpiresAt: getOfflineGraceExpiry(persistedState)?.toISOString() || null,
        error: persistedState.lastError
      });
      return getSnapshot();
    }

    try {
      const responsePayload = await requestLicenseApi('/api/licenses/validate', {
        licenseKey: persistedState.licenseKey,
        machineId: persistedState.machineId,
        appVersion: licenseConfig.appVersion
      });

      await applyRemoteLease({
        licenseKey: persistedState.licenseKey,
        responsePayload
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Falha ao validar licença armazenada.';
      persistedState.lastValidationAttemptAt = nowIso();
      persistedState.lastError = errorMessage;
      await persistState(persistedState);

      if (isConnectivityFailure(error)) {
        await applyOfflineCache(errorMessage);
      } else {
        applyState({
          configured: true,
          accessAllowed: false,
          status: 'locked',
          reason: 'license_invalid',
          license: persistedState.session?.license || null,
          activation: persistedState.session?.activation || null,
          lease: persistedState.session?.lease || null,
          lastValidatedOnlineAt: persistedState.lastValidatedOnlineAt,
          lastValidationAttemptAt: persistedState.lastValidationAttemptAt,
          offlineGraceExpiresAt: getOfflineGraceExpiry(persistedState)?.toISOString() || null,
          error: errorMessage
        });
      }
    }

    return getSnapshot();
  }

  async function activate(licenseKey) {
    const normalizedKey = normalizeLicenseKey(licenseKey);

    if (!licenseConfig.apiBaseUrl) {
      const error = new Error('Servidor de licenças não configurado neste app.');
      error.statusCode = 503;
      throw error;
    }

    if (!normalizedKey) {
      const error = new Error('Informe a chave de acesso para ativar o Pulso.');
      error.statusCode = 400;
      throw error;
    }

    const responsePayload = await requestLicenseApi('/api/licenses/activate', {
      licenseKey: normalizedKey,
      machineId: persistedState.machineId,
      deviceName: snapshot.deviceName,
      appVersion: licenseConfig.appVersion
    });

    await applyRemoteLease({
      licenseKey: normalizedKey,
      responsePayload
    });

    return getSnapshot();
  }

  async function validate() {
    if (!licenseConfig.apiBaseUrl) {
      const error = new Error('Servidor de licenças não configurado neste app.');
      error.statusCode = 503;
      throw error;
    }

    if (!persistedState.licenseKey) {
      const error = new Error('Nenhuma licença ativa foi encontrada neste dispositivo.');
      error.statusCode = 409;
      throw error;
    }

    try {
      const responsePayload = await requestLicenseApi('/api/licenses/validate', {
        licenseKey: persistedState.licenseKey,
        machineId: persistedState.machineId,
        appVersion: licenseConfig.appVersion
      });

      await applyRemoteLease({
        licenseKey: persistedState.licenseKey,
        responsePayload
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Falha ao validar licença armazenada.';
      persistedState.lastValidationAttemptAt = nowIso();
      persistedState.lastError = errorMessage;
      await persistState(persistedState);

      if (isConnectivityFailure(error)) {
        await applyOfflineCache(errorMessage);
      } else {
        applyState({
          configured: true,
          accessAllowed: false,
          status: 'locked',
          reason: 'license_invalid',
          license: persistedState.session?.license || null,
          activation: persistedState.session?.activation || null,
          lease: persistedState.session?.lease || null,
          lastValidatedOnlineAt: persistedState.lastValidatedOnlineAt,
          lastValidationAttemptAt: persistedState.lastValidationAttemptAt,
          offlineGraceExpiresAt: getOfflineGraceExpiry(persistedState)?.toISOString() || null,
          error: errorMessage
        });
      }
    }

    return getSnapshot();
  }

  async function deactivate() {
    if (!licenseConfig.apiBaseUrl) {
      const error = new Error('Servidor de licenças não configurado neste app.');
      error.statusCode = 503;
      throw error;
    }

    if (!persistedState.licenseKey) {
      const error = new Error('Nenhuma licença ativa foi encontrada neste dispositivo.');
      error.statusCode = 409;
      throw error;
    }

    await requestLicenseApi('/api/licenses/deactivate', {
      licenseKey: persistedState.licenseKey,
      machineId: persistedState.machineId
    });

    await clearSession({
      reason: 'deactivated_by_user',
      error: null
    });

    return getSnapshot();
  }

  return {
    bootstrap,
    getSnapshot,
    isAccessAllowed,
    activate,
    validate,
    deactivate
  };
}
