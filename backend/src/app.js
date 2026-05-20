import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendConfig, getBackendBaseUrl } from './config.js';
import { createMediaStorage, getMediaDirectory, getMediaRouteBase } from './media-storage.js';
import { createOverlaySettingsStorage } from './overlay-settings-storage.js';
import { createRuntimeStore } from './runtime-store.js';
import { createRuntimeStateStorage, getRuntimeStateFilePath } from './runtime-state-storage.js';
import { createWhatsAppService } from './whatsapp-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const overlayDirectory = join(__dirname, 'overlay');

function getWhatsAppHealthStatus(connection) {
  if (connection === 'ready' || connection === 'authenticated') {
    return 'ok';
  }

  if (
    connection === 'idle' ||
    connection === 'starting' ||
    connection === 'qr_ready' ||
    connection === 'recovering'
  ) {
    return 'degraded';
  }

  if (connection === 'auth_failure' || connection === 'error' || connection === 'disconnected') {
    return 'error';
  }

  return 'degraded';
}

export async function createApp({ startedAt }) {
  const app = express();
  const runtimeStateStorage = createRuntimeStateStorage();
  const restoredRuntimeState = await runtimeStateStorage.load();
  const overlaySettingsStorage = createOverlaySettingsStorage();
  await overlaySettingsStorage.load();
  const store = createRuntimeStore({
    initialState: restoredRuntimeState.initialState,
    onChange: (snapshot) => {
      void runtimeStateStorage.persist(snapshot);
    }
  });
  const mediaStorage = createMediaStorage();
  const whatsapp = createWhatsAppService({ store, mediaStorage });
  const whatsAppStartupMeta = await whatsapp.getStartupMeta();
  const whatsAppBootstrap = await whatsapp.bootstrap();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(getMediaRouteBase(), express.static(getMediaDirectory()));
  app.use('/overlay/assets', express.static(join(overlayDirectory, 'assets')));

  app.get('/health', (_request, response) => {
    const uptimeSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    const whatsappSnapshot = whatsapp.getSnapshot();
    const whatsappHealth = getWhatsAppHealthStatus(whatsappSnapshot.connection);
    const overallStatus = whatsappHealth === 'error' ? 'degraded' : 'ok';

    response.json({
      status: overallStatus,
      service: backendConfig.appName,
      environment: backendConfig.appEnv,
      uptimeSeconds,
      startedAt: startedAt.toISOString(),
      components: {
        api: 'ok',
        whatsapp: whatsappHealth
      }
    });
  });

  app.get('/api/system/status', (_request, response) => {
    const snapshot = store.getSnapshot();
    const whatsappSnapshot = whatsapp.getSnapshot();
    const runtimeStatusMeta = runtimeStateStorage.getStatusMeta();

    response.json({
      app: {
        name: backendConfig.appName,
        environment: backendConfig.appEnv,
        startedAt: startedAt.toISOString()
      },
      transport: {
        host: backendConfig.host,
        port: backendConfig.port,
        baseUrl: getBackendBaseUrl(),
        overlayUrl: `${getBackendBaseUrl()}/overlay`
      },
      features: {
        moderation: 'in_progress',
        whatsapp: 'in_progress',
        polls: snapshot.activePoll ? 'active' : 'in_progress',
        overlay: 'in_progress',
        mediaImages: 'in_progress',
        mediaAudio: 'in_progress',
        mediaVideo: 'in_progress'
      },
      runtime: {
        queueSize: snapshot.moderationQueue.length,
        liveItem: snapshot.liveItem,
        restoredFromDisk: runtimeStatusMeta.restoredFromDisk,
        persistedAt: runtimeStatusMeta.persistedAt,
        stateFilePath: getRuntimeStateFilePath()
      },
      overlaySettings: overlaySettingsStorage.getSnapshot(),
      whatsapp: {
        connection: whatsappSnapshot.connection,
        sessionName: whatsappSnapshot.sessionName,
        autoConnectEnabled: whatsAppStartupMeta.autoConnectEnabled,
        hasSavedSession: whatsAppStartupMeta.hasSavedSession,
        bootstrap: whatsAppBootstrap
      }
    });
  });

  app.post('/api/system/cleanup', async (_request, response) => {
    const clearedState = store.clearOperationalState();
    await runtimeStateStorage.clearOperationalData();
    await runtimeStateStorage.persist(store.getPersistenceSnapshot());

    response.json({
      ok: true,
      clearedAt: new Date().toISOString(),
      preserved: {
        whatsappSession: true
      },
      state: clearedState
    });
  });

  app.get('/api/moderation/state', (_request, response) => {
    response.json(store.getSnapshot());
  });

  app.get('/api/overlay/state', (_request, response) => {
    const snapshot = store.getSnapshot();

    response.setHeader('Cache-Control', 'no-store');
    response.json({
      liveItem: snapshot.liveItem,
      activePoll: snapshot.activePoll,
      settings: overlaySettingsStorage.getSnapshot(),
      updatedAt: new Date().toISOString()
    });
  });

  app.get('/api/overlay/settings', (_request, response) => {
    response.json(overlaySettingsStorage.getSnapshot());
  });

  app.post('/api/overlay/settings', async (request, response) => {
    const settings = await overlaySettingsStorage.update(request.body ?? {});
    response.json(settings);
  });

  app.get('/overlay', (_request, response) => {
    response.sendFile(join(overlayDirectory, 'index.html'));
  });

  app.post('/api/moderation/messages', (request, response) => {
    const { author, phone, content } = request.body ?? {};

    if (!content?.trim()) {
      return response.status(400).json({
        error: 'Conteudo da mensagem e obrigatorio.'
      });
    }

    const item = store.enqueueTextMessage({ author, phone, content, source: 'manual' });
    return response.status(201).json(item);
  });

  app.post('/api/moderation/items/:id/approve', (request, response) => {
    const item = store.approveItem(request.params.id);

    if (!item) {
      return response.status(404).json({ error: 'Item nao encontrado.' });
    }

    return response.json(item);
  });

  app.post('/api/moderation/items/:id/reject', (request, response) => {
    const item = store.rejectItem(request.params.id);

    if (!item) {
      return response.status(404).json({ error: 'Item nao encontrado.' });
    }

    return response.json(item);
  });

  app.post('/api/moderation/items/:id/live', (request, response) => {
    const item = store.setLiveItem(request.params.id);

    if (!item) {
      return response.status(404).json({ error: 'Item nao encontrado.' });
    }

    return response.json(item);
  });

  app.post('/api/moderation/live/clear', (_request, response) => {
    response.json(store.clearLiveItem());
  });

  app.get('/api/polls/active', (_request, response) => {
    response.json({
      activePoll: store.getSnapshot().activePoll
    });
  });

  app.post('/api/polls', (request, response) => {
    const title = request.body?.title?.trim();
    const options = Array.isArray(request.body?.options)
      ? request.body.options.map((option) => String(option || '').trim()).filter(Boolean)
      : [];

    if (!title) {
      return response.status(400).json({ error: 'Titulo da enquete e obrigatorio.' });
    }

    if (options.length < 2) {
      return response.status(400).json({ error: 'Informe pelo menos duas opcoes.' });
    }

    if (options.length > 26) {
      return response.status(400).json({ error: 'Limite de 26 opcoes por enquete.' });
    }

    const poll = store.createPoll({ title, options });
    return response.status(201).json(poll);
  });

  app.post('/api/polls/close', (_request, response) => {
    const poll = store.closePoll();
    response.json({
      closedPoll: poll
    });
  });

  app.get('/api/whatsapp/status', (_request, response) => {
    response.json(whatsapp.getSnapshot());
  });

  app.post('/api/whatsapp/connect', async (_request, response) => {
    const snapshot = await whatsapp.connect();
    response.status(202).json(snapshot);
  });

  app.post('/api/whatsapp/reset-runtime', async (_request, response) => {
    const snapshot = await whatsapp.resetRuntime();
    response.json(snapshot);
  });

  return {
    app,
    shutdown: () => whatsapp.shutdown()
  };
}
