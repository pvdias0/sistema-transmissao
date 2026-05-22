import 'dotenv/config';
import express from 'express';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
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

function isPrivateLanAddress(address) {
  if (address.startsWith('10.')) {
    return true;
  }

  if (address.startsWith('192.168.')) {
    return true;
  }

  const parts = address.split('.').map((value) => Number.parseInt(value, 10));
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function isCarrierGradeNatAddress(address) {
  const parts = address.split('.').map((value) => Number.parseInt(value, 10));
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function isLinkLocalAddress(address) {
  return address.startsWith('169.254.');
}

function isLikelyVirtualInterface(name) {
  const normalized = String(name || '').toLowerCase();
  return (
    normalized.includes('tailscale') ||
    normalized.includes('zerotier') ||
    normalized.includes('vethernet') ||
    normalized.includes('hyper-v') ||
    normalized.includes('vmware') ||
    normalized.includes('virtualbox') ||
    normalized.includes('docker') ||
    normalized.includes('wsl')
  );
}

function getWindowsDefaultRouteAddress() {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const output = execFileSync('route', ['print', '-4'], {
      encoding: 'utf8',
      windowsHide: true
    });

    const defaultRouteMatch = output.match(
      /^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+\S+\s+(\d+\.\d+\.\d+\.\d+)\s+\d+\s*$/m
    );

    return defaultRouteMatch?.[1] || null;
  } catch {
    return null;
  }
}

function getNetworkCandidates() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        candidates.push({
          name,
          address: entry.address,
          privateLan: isPrivateLanAddress(entry.address),
          carrierGradeNat: isCarrierGradeNatAddress(entry.address),
          linkLocal: isLinkLocalAddress(entry.address),
          virtual: isLikelyVirtualInterface(name)
        });
      }
    }
  }

  return candidates;
}

function getPreferredNetworkAddress() {
  const candidates = getNetworkCandidates();
  const windowsDefaultRouteAddress = getWindowsDefaultRouteAddress();

  if (windowsDefaultRouteAddress) {
    const defaultRouteCandidate = candidates.find(
      (candidate) => candidate.address === windowsDefaultRouteAddress
    );

    if (defaultRouteCandidate) {
      return defaultRouteCandidate.address;
    }
  }

  const privateLan = candidates.find((candidate) => candidate.privateLan && !candidate.virtual);
  if (privateLan) {
    return privateLan.address;
  }

  const privateLanVirtual = candidates.find((candidate) => candidate.privateLan);
  if (privateLanVirtual) {
    return privateLanVirtual.address;
  }

  const nonVirtual = candidates.find(
    (candidate) => !candidate.virtual && !candidate.carrierGradeNat && !candidate.linkLocal
  );
  if (nonVirtual) {
    return nonVirtual.address;
  }

  const nonCgNat = candidates.find((candidate) => !candidate.carrierGradeNat && !candidate.linkLocal);
  if (nonCgNat) {
    return nonCgNat.address;
  }

  return candidates[0]?.address || null;
}

function getRecommendedNetworkCandidate() {
  const address = getPreferredNetworkAddress();

  if (!address) {
    return null;
  }

  return getNetworkCandidates().find((candidate) => candidate.address === address) || null;
}

function getNetworkBaseUrl() {
  const address = getPreferredNetworkAddress();

  if (!address) {
    return null;
  }

  return `http://${address}:${backendConfig.port}`;
}

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
    const networkBaseUrl = getNetworkBaseUrl();
    const networkCandidates = getNetworkCandidates();
    const recommendedNetworkCandidate = getRecommendedNetworkCandidate();

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
        overlayUrl: `${getBackendBaseUrl()}/overlay`,
        overlayMessageUrl: `${getBackendBaseUrl()}/overlay/message`,
        overlayPollUrl: `${getBackendBaseUrl()}/overlay/poll`,
        networkBaseUrl,
        recommendedNetworkAddress: recommendedNetworkCandidate?.address || null,
        networkCandidates,
        overlayNetworkUrl: networkBaseUrl ? `${networkBaseUrl}/overlay` : null,
        overlayNetworkMessageUrl: networkBaseUrl ? `${networkBaseUrl}/overlay/message` : null,
        overlayNetworkPollUrl: networkBaseUrl ? `${networkBaseUrl}/overlay/poll` : null
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
        mediaTransport: snapshot.mediaTransport,
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
      mediaTransport: snapshot.mediaTransport,
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

  app.get('/overlay/message', (_request, response) => {
    response.sendFile(join(overlayDirectory, 'index.html'));
  });

  app.get('/overlay/poll', (_request, response) => {
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
      return response.status(404).json({ error: 'Item não encontrado.' });
    }

    return response.json(item);
  });

  app.post('/api/moderation/items/:id/reject', (request, response) => {
    const item = store.rejectItem(request.params.id);

    if (!item) {
      return response.status(404).json({ error: 'Item não encontrado.' });
    }

    return response.json(item);
  });

  app.post('/api/moderation/items/:id/live', (request, response) => {
    const item = store.setLiveItem(request.params.id);

    if (!item) {
      return response.status(404).json({ error: 'Item não encontrado.' });
    }

    return response.json(item);
  });

  app.post('/api/moderation/live/clear', (_request, response) => {
    response.json(store.clearLiveItem());
  });

  app.post('/api/media/transport/command', (request, response) => {
    const action = String(request.body?.action || '').trim();
    const deltaSeconds = Number(request.body?.deltaSeconds);
    const targetTime = Number(request.body?.targetTime);

    if (!action) {
      return response.status(400).json({ error: 'Acao de transporte e obrigatoria.' });
    }

    if (!['play', 'pause', 'stop', 'restart', 'seek_relative', 'seek_to'].includes(action)) {
      return response.status(400).json({ error: 'Acao de transporte invalida.' });
    }

    if (action === 'seek_relative' && !Number.isFinite(deltaSeconds)) {
      return response.status(400).json({ error: 'deltaSeconds e obrigatorio para seek_relative.' });
    }

    if (action === 'seek_to' && !Number.isFinite(targetTime)) {
      return response.status(400).json({ error: 'targetTime e obrigatorio para seek_to.' });
    }

    const mediaTransport = store.issueMediaCommand(action, {
      deltaSeconds,
      targetTime
    });

    if (!mediaTransport) {
      return response.status(409).json({
        error: 'Não existe audio ou video no ar para controlar.'
      });
    }

    return response.json(mediaTransport);
  });

  app.post('/api/media/transport/telemetry', (request, response) => {
    const itemId = String(request.body?.itemId || '').trim();

    if (!itemId) {
      return response.status(400).json({ error: 'itemId e obrigatorio.' });
    }

    const mediaTransport = store.updateMediaTelemetry({
      itemId,
      status: request.body?.status,
      currentTime: Number(request.body?.currentTime),
      duration: Number(request.body?.duration),
      error: request.body?.error
    });

    if (!mediaTransport) {
      return response.status(409).json({
        error: 'Telemetria recebida para item sem controle de transporte ativo.'
      });
    }

    return response.json(mediaTransport);
  });

  app.get('/api/polls/active', (_request, response) => {
    response.json({
      activePoll: store.getSnapshot().activePoll
    });
  });

  app.post('/api/polls', (request, response) => {
    const title = request.body?.title?.trim();
    const options = Array.isArray(request.body?.options)
      ? request.body.options
          .map((option) => {
            if (typeof option === 'string') {
              const label = String(option || '').trim();

              if (!label) {
                return null;
              }

              return {
                label,
                color: '#8ef2cf',
                aliases: []
              };
            }

            const label = String(option?.label || '').trim();

            if (!label) {
              return null;
            }

            const aliases = Array.isArray(option?.aliases)
              ? option.aliases.map((alias) => String(alias || '').trim()).filter(Boolean)
              : [];

            return {
              label,
              color: String(option?.color || '').trim() || '#8ef2cf',
              aliases
            };
          })
          .filter(Boolean)
      : [];

    if (!title) {
      return response.status(400).json({ error: 'Título da enquete e obrigatório.' });
    }

    if (options.length < 2) {
      return response.status(400).json({ error: 'Informe pelo menos duas opções.' });
    }

    if (options.length > 5) {
      return response.status(400).json({ error: 'Limite de 5 opções por enquete.' });
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

  app.post('/api/whatsapp/logout', async (_request, response) => {
    const snapshot = await whatsapp.logout();
    response.json(snapshot);
  });

  return {
    app,
    shutdown: () => whatsapp.shutdown()
  };
}
