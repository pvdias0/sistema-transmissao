const DEFAULT_PORT = 47831;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_LICENSE_OFFLINE_GRACE_HOURS = 168;

function parsePort(value) {
  const parsed = Number.parseInt(value ?? '', 10);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_PORT;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

export const backendConfig = {
  appName: 'sistema-transmissao-backend',
  appEnv: process.env.APP_ENV || process.env.NODE_ENV || 'development',
  host: process.env.HOST || DEFAULT_HOST,
  port: parsePort(process.env.PORT)
};

export const licenseConfig = {
  apiBaseUrl: process.env.LICENSE_API_BASE_URL?.trim() || '',
  offlineGraceHours: parsePositiveInteger(
    process.env.LICENSE_OFFLINE_GRACE_HOURS,
    DEFAULT_LICENSE_OFFLINE_GRACE_HOURS
  ),
  appVersion: process.env.PULSO_APP_VERSION?.trim() || null
};

function getPublicFacingHost() {
  if (backendConfig.host === '0.0.0.0' || backendConfig.host === '::') {
    return '127.0.0.1';
  }

  return backendConfig.host;
}

export function getBackendBaseUrl() {
  return `http://${getPublicFacingHost()}:${backendConfig.port}`;
}
