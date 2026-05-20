const DEFAULT_PORT = 47831;
const DEFAULT_HOST = '127.0.0.1';

function parsePort(value) {
  const parsed = Number.parseInt(value ?? '', 10);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_PORT;
}

export const backendConfig = {
  appName: 'sistema-transmissao-backend',
  appEnv: process.env.APP_ENV || process.env.NODE_ENV || 'development',
  host: process.env.HOST || DEFAULT_HOST,
  port: parsePort(process.env.PORT)
};

export function getBackendBaseUrl() {
  return `http://${backendConfig.host}:${backendConfig.port}`;
}
