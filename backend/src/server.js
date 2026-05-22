import { createServer } from 'node:http';
import { createApp } from './app.js';
import { backendConfig, getBackendBaseUrl } from './config.js';

const startedAt = new Date();
const { app, shutdown: shutdownApp } = await createApp({ startedAt });
const server = createServer(app);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Porta ${backendConfig.port} já esta em uso em ${backendConfig.host}. Verifique se o backend já esta em execucao.`
    );
    process.exit(1);
  }

  console.error('Falha no servidor HTTP do backend:', error);
  process.exit(1);
});

server.listen(backendConfig.port, backendConfig.host, () => {
  console.log(`Backend local em ${getBackendBaseUrl()}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Encerrando backend (${signal})...`);

  await shutdownApp();

  server.close(() => {
    process.exit(0);
  });
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
