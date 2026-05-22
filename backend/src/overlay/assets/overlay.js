const POLL_INTERVAL_MS = 700;
const TELEMETRY_THROTTLE_MS = 450;
const searchParams = new URLSearchParams(window.location.search);
const isDebugMode = searchParams.get('debug') === '1';
const overlayMode = (() => {
  const mode = String(searchParams.get('mode') || '').toLowerCase();
  if (mode === 'message' || mode === 'poll') {
    return mode;
  }

  const normalizedPath = window.location.pathname.replace(/\/+$/, '');
  if (normalizedPath.endsWith('/overlay/message')) {
    return 'message';
  }
  if (normalizedPath.endsWith('/overlay/poll')) {
    return 'poll';
  }

  return 'all';
})();
const shouldRenderMessages = overlayMode !== 'poll';
const shouldRenderPolls = overlayMode !== 'message';
const DEFAULT_AVATAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a3a46"/>
      <stop offset="100%" stop-color="#0f171c"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" rx="80" fill="url(#g)"/>
  <circle cx="80" cy="62" r="30" fill="#cfe7dd"/>
  <path d="M28 132c10-26 34-42 52-42s42 16 52 42" fill="#cfe7dd"/>
</svg>
`.trim();
const DEFAULT_AVATAR_URL = `data:image/svg+xml;utf8,${encodeURIComponent(DEFAULT_AVATAR_SVG)}`;

const liveCard = document.getElementById('live-card');
const liveHeader = document.querySelector('.live-header');
const liveAuthor = document.getElementById('live-author');
const liveAvatar = document.getElementById('live-avatar');
const liveDate = document.getElementById('live-date');
const liveMessage = document.getElementById('live-message');
const liveMediaRegion = document.getElementById('live-media-region');
const liveTime = document.getElementById('live-time');
const liveCheck = document.querySelector('.live-check');
const liveMeta = document.querySelector('.live-meta');
const debugEmptyState = document.getElementById('debug-empty-state');
const debugEmptyText = document.querySelector('#debug-empty-state .debug-empty-text');
const pollLayer = document.getElementById('poll-layer');
const pollTitle = document.getElementById('poll-title');
const pollOptions = document.getElementById('poll-options');
const pollMeta = document.getElementById('poll-meta');

let lastLiveItemId = null;
let lastPollId = null;
let currentOverlaySettings = null;
let currentLiveItem = null;
let currentActivePoll = null;
let currentMediaElement = null;
let currentMediaTransport = null;
let lastAppliedCommandVersion = 0;
let lastTelemetrySentAt = 0;
let currentMessageBoxMode = 'auto';
let currentPollBoxMode = 'auto';
let lastMessageManualSignature = '';
let lastPollManualSignature = '';

if (isDebugMode) {
  document.body.classList.add('debug-mode');
}

function resolveMediaUrl(publicPath) {
  return new URL(publicPath, window.location.origin).toString();
}

function normalizeBackgroundImageValue(value) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return 'none';
  }

  return `url("${normalized.replace(/"/g, '\\"')}")`;
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0:00';
  }

  const safeSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function parseReceivedAt(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(date) {
  if (!date) {
    return '';
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - target) / 86400000);

  if (diffDays === 0) {
    return 'Hoje';
  }
  if (diffDays === 1) {
    return 'Ontem';
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatTimeLabel(date) {
  if (!date) {
    return '';
  }

  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function applyDefaultAvatar(author) {
  if (!liveAvatar) {
    return;
  }

  liveAvatar.dataset.fallback = 'true';
  liveAvatar.src = DEFAULT_AVATAR_URL;
  liveAvatar.alt = author ? `Perfil padrao de ${author}` : 'Perfil padrao';
  liveAvatar.classList.remove('is-hidden');
}

if (liveAvatar) {
  liveAvatar.addEventListener('error', () => {
    if (liveAvatar.dataset.fallback === 'true') {
      return;
    }

    applyDefaultAvatar(currentLiveItem?.author);
  });
}

function applyOverlaySettings(settings) {
  const canvasEnabled = settings?.canvas?.enabled ?? false;
  const canvasBackgroundColor = settings?.canvas?.backgroundColor ?? '#0e171c';
  const messageFontSize = settings?.message?.fontSize ?? 32;
  const pollFontSize = settings?.poll?.fontSize ?? 24;
  const messageBoxWidth = settings?.message?.boxWidth ?? 1080;
  const messageBoxHeight = settings?.message?.boxHeight ?? 560;
  const pollBoxWidth = settings?.poll?.boxWidth ?? 680;
  const pollBoxHeight = settings?.poll?.boxHeight ?? 360;
  const messageFontFamily = settings?.message?.fontFamily ?? 'Segoe UI';
  const pollFontFamily = settings?.poll?.fontFamily ?? 'Segoe UI';
  const messageTextColor = settings?.message?.textColor ?? '#f7fbfb';
  const pollTextColor = settings?.poll?.textColor ?? '#f7fbfb';
  const messageAccentColor = settings?.message?.accentColor ?? '#8ef2cf';
  const pollAccentColor = settings?.poll?.accentColor ?? '#8ef2cf';
  const messageBackgroundColor = settings?.message?.backgroundColor ?? '#101a1f';
  const pollBackgroundColor = settings?.poll?.backgroundColor ?? '#0e1820';
  currentOverlaySettings = settings ?? null;

  document.documentElement.style.setProperty(
    '--overlay-canvas-color',
    canvasEnabled ? canvasBackgroundColor : 'transparent'
  );
  document.documentElement.style.setProperty(
    '--overlay-canvas-image',
    canvasEnabled ? normalizeBackgroundImageValue(settings?.canvas?.backgroundImageUrl) : 'none'
  );
  document.documentElement.style.setProperty('--message-font-size', `${messageFontSize}px`);
  document.documentElement.style.setProperty('--message-font-size-effective', `${messageFontSize}px`);
  document.documentElement.style.setProperty('--poll-font-size', `${pollFontSize}px`);
  document.documentElement.style.setProperty('--message-card-width', `${messageBoxWidth}px`);
  document.documentElement.style.setProperty('--message-card-height', `${messageBoxHeight}px`);
  document.documentElement.style.setProperty('--poll-card-width', `${pollBoxWidth}px`);
  document.documentElement.style.setProperty('--poll-card-height', `${pollBoxHeight}px`);
  document.documentElement.style.setProperty('--message-font-family', `"${messageFontFamily}"`);
  document.documentElement.style.setProperty('--poll-font-family', `"${pollFontFamily}"`);
  document.documentElement.style.setProperty('--message-text-color', messageTextColor);
  document.documentElement.style.setProperty('--poll-text-color', pollTextColor);
  document.documentElement.style.setProperty('--message-accent-color', messageAccentColor);
  document.documentElement.style.setProperty('--poll-accent-color', pollAccentColor);
  document.documentElement.style.setProperty('--message-background-color', messageBackgroundColor);
  document.documentElement.style.setProperty('--poll-background-color', pollBackgroundColor);
  document.documentElement.style.setProperty(
    '--message-background-image',
    normalizeBackgroundImageValue(settings?.message?.backgroundImageUrl)
  );
  document.documentElement.style.setProperty(
    '--poll-background-image',
    normalizeBackgroundImageValue(settings?.poll?.backgroundImageUrl)
  );
}

function getBoxSignature(target) {
  const boxWidth = currentOverlaySettings?.[target]?.boxWidth ?? 0;
  const boxHeight = currentOverlaySettings?.[target]?.boxHeight ?? 0;
  return `${boxWidth}x${boxHeight}`;
}

function clampDimension(value, min, max) {
  return Math.min(Math.max(Math.round(value), min), max);
}

function applyMessageBoxDimensions(width, height) {
  document.documentElement.style.setProperty('--message-card-width', `${width}px`);
  document.documentElement.style.setProperty('--message-card-height', `${height}px`);
}

function applyPollBoxDimensions(width, height) {
  document.documentElement.style.setProperty('--poll-card-width', `${width}px`);
  document.documentElement.style.setProperty('--poll-card-height', `${height}px`);
}

function computeAutoMessageBoxDimensions(liveItem) {
  const viewportWidth = Math.max(360, window.innerWidth - 96);
  const viewportHeight = Math.max(220, window.innerHeight - 160);
  const content = liveItem?.content?.trim() || '';
  const lineBreakCount = (content.match(/\n/g) || []).length;
  const contentLength = content.length;
  const estimatedLineCount = Math.max(1, Math.ceil(contentLength / 34) + lineBreakCount);

  let width = 700;
  let height = 250;

  if (liveItem?.type === 'image') {
    width = 780;
    height = 470;
  } else if (liveItem?.type === 'video') {
    width = 820;
    height = 520;
  } else if (liveItem?.type === 'audio') {
    width = 760;
    height = 260;
  }

  if (content) {
    width += Math.min(220, contentLength * 0.9 + lineBreakCount * 26);
    height += Math.min(240, estimatedLineCount * 22);
  }

  return {
    width: clampDimension(width, 320, viewportWidth),
    height: clampDimension(height, 180, viewportHeight)
  };
}

function computeAutoPollBoxDimensions(activePoll) {
  const viewportWidth = Math.max(360, window.innerWidth - 96);
  const viewportHeight = Math.max(220, window.innerHeight - 160);
  const title = activePoll?.title?.trim() || '';
  const titleLength = title.length;
  const optionCount = Array.isArray(activePoll?.options) ? activePoll.options.length : 0;
  const longestOption = Math.max(
    0,
    ...(activePoll?.options || []).map((option) => String(option?.label || '').length)
  );

  const titleLineEstimate = Math.max(1, Math.ceil(titleLength / 28));
  const width = 560 + Math.min(240, longestOption * 6 + titleLength * 1.1);
  const height = 170 + optionCount * 68 + titleLineEstimate * 26;

  return {
    width: clampDimension(width, 360, viewportWidth),
    height: clampDimension(height, 220, viewportHeight)
  };
}

function syncMessageBoxMode(liveItem, isNewLiveItem) {
  const manualSignature = getBoxSignature('message');

  if (!liveItem) {
    currentMessageBoxMode = 'auto';
    lastMessageManualSignature = manualSignature;
    applyMessageBoxDimensions(
      currentOverlaySettings?.message?.boxWidth ?? 1080,
      currentOverlaySettings?.message?.boxHeight ?? 560
    );
    return;
  }

  if (isNewLiveItem) {
    currentMessageBoxMode = 'auto';
    lastMessageManualSignature = manualSignature;
  } else if (manualSignature !== lastMessageManualSignature) {
    currentMessageBoxMode = 'manual';
    lastMessageManualSignature = manualSignature;
  }

  if (currentMessageBoxMode === 'manual') {
    applyMessageBoxDimensions(
      currentOverlaySettings?.message?.boxWidth ?? 1080,
      currentOverlaySettings?.message?.boxHeight ?? 560
    );
    return;
  }

  const autoDimensions = computeAutoMessageBoxDimensions(liveItem);
  applyMessageBoxDimensions(autoDimensions.width, autoDimensions.height);
}

function syncPollBoxMode(activePoll) {
  const manualSignature = getBoxSignature('poll');
  const isNewPoll = activePoll?.id && activePoll.id !== lastPollId;

  if (!activePoll) {
    currentPollBoxMode = 'auto';
    lastPollManualSignature = manualSignature;
    applyPollBoxDimensions(
      currentOverlaySettings?.poll?.boxWidth ?? 680,
      currentOverlaySettings?.poll?.boxHeight ?? 360
    );
    return;
  }

  if (isNewPoll) {
    currentPollBoxMode = 'auto';
    lastPollManualSignature = manualSignature;
  } else if (manualSignature !== lastPollManualSignature) {
    currentPollBoxMode = 'manual';
    lastPollManualSignature = manualSignature;
  }

  if (currentPollBoxMode === 'manual') {
    applyPollBoxDimensions(
      currentOverlaySettings?.poll?.boxWidth ?? 680,
      currentOverlaySettings?.poll?.boxHeight ?? 360
    );
    return;
  }

  const autoDimensions = computeAutoPollBoxDimensions(activePoll);
  applyPollBoxDimensions(autoDimensions.width, autoDimensions.height);
}

function getBaseMessageFontSize() {
  return currentOverlaySettings?.message?.fontSize ?? 32;
}

function resetLiveMessageLayout() {
  liveCard.classList.remove('is-expanded', 'is-condensed', 'is-tight');
  delete liveCard.dataset.liveType;
  document.documentElement.style.setProperty(
    '--message-font-size-effective',
    `${getBaseMessageFontSize()}px`
  );
  document.documentElement.style.setProperty('--message-media-max-height', '52vh');
}

function updateMediaHeightBudget() {
  if (!liveCard) {
    return;
  }

  const hasVisibleMedia = !liveMediaRegion.classList.contains('is-hidden');
  if (!hasVisibleMedia) {
    document.documentElement.style.setProperty('--message-media-max-height', '52vh');
    return;
  }

  const headerHeight = liveHeader?.offsetHeight || 0;
  const metaHeight = liveMeta?.offsetHeight || 0;
  const messageHeight = liveMessage.classList.contains('is-hidden')
    ? 0
    : Math.min(liveMessage.scrollHeight, Math.round(liveCard.clientHeight * 0.34));
  const reservedChrome = headerHeight + metaHeight + messageHeight + 84;
  const availableHeight = Math.max(110, liveCard.clientHeight - reservedChrome);
  document.documentElement.style.setProperty('--message-media-max-height', `${availableHeight}px`);
}

function renderLiveAvatar(liveItem) {
  if (!liveAvatar) {
    return;
  }

  if (!liveItem) {
    liveAvatar.dataset.fallback = 'false';
    liveAvatar.classList.add('is-hidden');
    liveAvatar.removeAttribute('src');
    liveAvatar.alt = '';
    return;
  }

  const avatarUrl = liveItem?.authorAvatarUrl;

  if (!avatarUrl) {
    applyDefaultAvatar(liveItem?.author);
    return;
  }

  liveAvatar.dataset.fallback = 'false';
  liveAvatar.src = avatarUrl;
  liveAvatar.alt = `Foto de ${liveItem?.author || 'autor'}`;
  liveAvatar.classList.remove('is-hidden');
}

function renderLiveTimestamp(liveItem) {
  if (!liveDate || !liveTime || !liveCheck) {
    return;
  }

  const timestamp = parseReceivedAt(liveItem?.receivedAt);
  const dateLabel = formatDateLabel(timestamp);
  const timeLabel = formatTimeLabel(timestamp);

  liveDate.textContent = dateLabel;
  liveTime.textContent = timeLabel;
  liveCheck.textContent = timeLabel ? '\u2713\u2713' : '';

  liveDate.classList.toggle('is-hidden', !dateLabel);
  liveTime.classList.toggle('is-hidden', !timeLabel);
  liveCheck.classList.toggle('is-hidden', !timeLabel);
}

function fitLiveMessageLayout(liveItem) {
  resetLiveMessageLayout();

  if (!liveItem) {
    return;
  }

  const content = liveItem.content?.trim() || '';
  const hasMedia =
    liveItem.type === 'image' || liveItem.type === 'audio' || liveItem.type === 'video';
  const lineBreakCount = (content.match(/\n/g) || []).length;
  const contentLength = content.length;
  const shouldExpandEarly = contentLength > 210 || lineBreakCount >= 2 || hasMedia;
  const isTightCard = liveCard.clientWidth < 520 || liveCard.clientHeight < 360;
  const minimumFontSize = hasMedia ? 12 : 14;

  if (isTightCard) {
    liveCard.classList.add('is-tight');
  }

  if (shouldExpandEarly) {
    liveCard.classList.add('is-expanded');
  }

  let effectiveFontSize = getBaseMessageFontSize();
  updateMediaHeightBudget();

  while (liveCard.scrollHeight > liveCard.clientHeight && effectiveFontSize > minimumFontSize) {
    effectiveFontSize -= 2;
    document.documentElement.style.setProperty(
      '--message-font-size-effective',
      `${effectiveFontSize}px`
    );
    updateMediaHeightBudget();
  }

  if (
    liveCard.scrollHeight > liveCard.clientHeight &&
    !liveCard.classList.contains('is-expanded')
  ) {
    liveCard.classList.add('is-expanded');
    effectiveFontSize = Math.min(effectiveFontSize, getBaseMessageFontSize());

    while (liveCard.scrollHeight > liveCard.clientHeight && effectiveFontSize > minimumFontSize) {
      effectiveFontSize -= 2;
      document.documentElement.style.setProperty(
        '--message-font-size-effective',
        `${effectiveFontSize}px`
      );
      updateMediaHeightBudget();
    }
  }

  if (liveCard.scrollHeight > liveCard.clientHeight) {
    liveCard.classList.add('is-condensed');
    updateMediaHeightBudget();

    while (liveCard.scrollHeight > liveCard.clientHeight && effectiveFontSize > minimumFontSize) {
      effectiveFontSize -= 1;
      document.documentElement.style.setProperty(
        '--message-font-size-effective',
        `${effectiveFontSize}px`
      );
      updateMediaHeightBudget();
    }
  }
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function getMediaPlaybackStatus() {
  if (!currentMediaElement) {
    return 'idle';
  }

  if (currentMediaElement.ended) {
    return 'ended';
  }

  if (currentMediaElement.paused) {
    if ((currentMediaElement.currentTime || 0) <= 0.05) {
      return 'cued';
    }

    return 'paused';
  }

  return 'playing';
}

async function postTransportTelemetry(payload, options = {}) {
  if (!currentLiveItem?.id) {
    return;
  }

  const now = Date.now();

  if (!options.force && now - lastTelemetrySentAt < TELEMETRY_THROTTLE_MS) {
    return;
  }

  lastTelemetrySentAt = now;

  try {
    await fetch('/api/media/transport/telemetry', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        itemId: currentLiveItem.id,
        ...payload
      })
    });
  } catch (_error) {
    // Telemetria falha silenciosamente para não quebrar o overlay.
  }
}

function attachMediaTelemetryListeners(mediaElement) {
  mediaElement.addEventListener('loadedmetadata', () => {
    void postTransportTelemetry(
      {
        status: getMediaPlaybackStatus(),
        currentTime: mediaElement.currentTime,
        duration: mediaElement.duration
      },
      { force: true }
    );
  });

  mediaElement.addEventListener('play', () => {
    void postTransportTelemetry(
      {
        status: 'playing',
        currentTime: mediaElement.currentTime,
        duration: mediaElement.duration
      },
      { force: true }
    );
  });

  mediaElement.addEventListener('pause', () => {
    void postTransportTelemetry(
      {
        status: mediaElement.ended ? 'ended' : getMediaPlaybackStatus(),
        currentTime: mediaElement.currentTime,
        duration: mediaElement.duration
      },
      { force: true }
    );
  });

  mediaElement.addEventListener('timeupdate', () => {
    void postTransportTelemetry({
      status: getMediaPlaybackStatus(),
      currentTime: mediaElement.currentTime,
      duration: mediaElement.duration
    });
  });

  mediaElement.addEventListener('ended', () => {
    void postTransportTelemetry(
      {
        status: 'ended',
        currentTime: mediaElement.currentTime,
        duration: mediaElement.duration
      },
      { force: true }
    );
  });

  mediaElement.addEventListener('error', () => {
    void postTransportTelemetry(
      {
        status: 'error',
        currentTime: mediaElement.currentTime,
        duration: mediaElement.duration,
        error: mediaElement.error?.message || 'Falha na reprodução da mídia.'
      },
      { force: true }
    );
  });
}

function createAudioShell(src) {
  const shell = document.createElement('div');
  shell.className = 'audio-shell';

  const playButton = document.createElement('div');
  playButton.className = 'audio-play';

  const playIcon = document.createElement('span');
  playIcon.className = 'audio-play-icon';
  playButton.appendChild(playIcon);

  const waveShell = document.createElement('div');
  waveShell.className = 'audio-wave-shell';

  const visualizer = document.createElement('div');
  visualizer.className = 'audio-visualizer';

  for (let index = 0; index < 9; index += 1) {
    const bar = document.createElement('span');
    bar.className = 'audio-bar';
    visualizer.appendChild(bar);
  }

  const durationLabel = document.createElement('span');
  durationLabel.className = 'audio-duration';
  durationLabel.textContent = '0:00';

  const audio = document.createElement('audio');
  audio.className = 'audio-element';
  audio.autoplay = false;
  audio.controls = false;
  audio.preload = 'auto';
  audio.src = src;
  attachMediaTelemetryListeners(audio);

  audio.addEventListener('loadedmetadata', () => {
    durationLabel.textContent = formatDuration(audio.duration);
  });

  waveShell.appendChild(visualizer);
  waveShell.appendChild(durationLabel);
  shell.appendChild(playButton);
  shell.appendChild(waveShell);
  shell.appendChild(audio);

  return {
    shell,
    mediaElement: audio
  };
}

function createVideoElement(src) {
  const video = document.createElement('video');
  video.autoplay = false;
  video.controls = false;
  video.loop = false;
  video.muted = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;
  attachMediaTelemetryListeners(video);
  return video;
}

function createVideoShell(src) {
  const shell = document.createElement('div');
  shell.className = 'video-shell';

  const video = createVideoElement(src);
  video.classList.add('video-element');

  const playBadge = document.createElement('div');
  playBadge.className = 'video-play';

  const playIcon = document.createElement('span');
  playIcon.className = 'video-play-icon';
  playBadge.appendChild(playIcon);

  const durationLabel = document.createElement('span');
  durationLabel.className = 'video-duration';
  durationLabel.textContent = '\u25B6 0:00';

  function syncPlaybackVisualState() {
    const isPlaying = !video.paused && !video.ended;
    shell.classList.toggle('is-playing', isPlaying);
    shell.classList.toggle('is-paused', video.paused && !video.ended && video.currentTime > 0);
    shell.classList.toggle('is-ended', video.ended);
  }

  video.addEventListener('loadedmetadata', () => {
    durationLabel.textContent = `\u25B6 ${formatDuration(video.duration)}`;
    syncPlaybackVisualState();
  });

  video.addEventListener('play', syncPlaybackVisualState);
  video.addEventListener('pause', syncPlaybackVisualState);
  video.addEventListener('ended', syncPlaybackVisualState);
  video.addEventListener('seeking', syncPlaybackVisualState);

  shell.appendChild(video);
  shell.appendChild(playBadge);
  shell.appendChild(durationLabel);

  return {
    shell,
    mediaElement: video
  };
}

function createImageElement(src, alt) {
  const image = document.createElement('img');
  image.className = 'media-image';
  image.src = src;
  image.alt = alt;
  return image;
}

function renderLiveItem(liveItem) {
  currentLiveItem = liveItem || null;

  if (!liveItem) {
    liveCard.classList.add('is-hidden');
    liveAuthor.textContent = '';
    renderLiveAvatar(null);
    renderLiveTimestamp(null);
    liveMessage.textContent = '';
    liveMessage.classList.add('is-hidden');
    clearChildren(liveMediaRegion);
    liveMediaRegion.classList.add('is-hidden');
    currentMediaElement = null;
    currentMediaTransport = null;
    lastAppliedCommandVersion = 0;
    resetLiveMessageLayout();
    lastLiveItemId = null;
    return;
  }

  const isNewLiveItem = liveItem.id !== lastLiveItemId;
  syncMessageBoxMode(liveItem, isNewLiveItem);

  liveCard.classList.remove('is-hidden');
  liveCard.dataset.liveType = liveItem.type || 'text';
  liveAuthor.textContent = `${liveItem.author || 'Anonimo'}`;
  renderLiveAvatar(liveItem);
  renderLiveTimestamp(liveItem);

  const content = liveItem.content?.trim() || '';
  if (content) {
    liveMessage.textContent = content;
    liveMessage.classList.remove('is-hidden');
  } else {
    liveMessage.textContent = '';
    liveMessage.classList.add('is-hidden');
  }

  if (isNewLiveItem) {
    clearChildren(liveMediaRegion);
    liveMediaRegion.classList.add('is-hidden');
    currentMediaElement = null;
    currentMediaTransport = null;
    lastAppliedCommandVersion = 0;

    if (liveItem.type === 'image' && liveItem.media?.publicPath) {
      liveMediaRegion.appendChild(
        createImageElement(
          resolveMediaUrl(liveItem.media.publicPath),
          `Imagem enviada por ${liveItem.author || 'Anonimo'}`
        )
      );
      liveMediaRegion.classList.remove('is-hidden');
    }

    if (liveItem.type === 'audio' && liveItem.media?.publicPath) {
      const { shell, mediaElement } = createAudioShell(resolveMediaUrl(liveItem.media.publicPath));
      liveMediaRegion.appendChild(shell);
      currentMediaElement = mediaElement;
      liveMediaRegion.classList.remove('is-hidden');
    }

    if (liveItem.type === 'video' && liveItem.media?.publicPath) {
      const { shell, mediaElement } = createVideoShell(resolveMediaUrl(liveItem.media.publicPath));
      liveMediaRegion.appendChild(shell);
      currentMediaElement = mediaElement;
      liveMediaRegion.classList.remove('is-hidden');
    }
  }

  fitLiveMessageLayout(liveItem);
  lastLiveItemId = liveItem.id;
}

function clampSeekTarget(value, mediaElement) {
  const minimum = 0;
  const maximum = Number.isFinite(mediaElement.duration)
    ? mediaElement.duration
    : Number.POSITIVE_INFINITY;

  return Math.max(minimum, Math.min(maximum, value));
}

async function applyMediaTransportCommand(mediaTransport) {
  if (!currentMediaElement || !currentLiveItem || !mediaTransport) {
    return;
  }

  if (mediaTransport.itemId !== currentLiveItem.id) {
    return;
  }

  if (mediaTransport.commandVersion === lastAppliedCommandVersion) {
    return;
  }

  const command = mediaTransport.lastCommand?.type;
  const mediaElement = currentMediaElement;

  if (command === 'cue') {
    mediaElement.pause();
    mediaElement.currentTime = 0;
  }

  if (command === 'play') {
    try {
      await mediaElement.play();
    } catch (_error) {
      void postTransportTelemetry(
        {
          status: 'error',
          currentTime: mediaElement.currentTime,
          duration: mediaElement.duration,
          error: 'O navegador bloqueou a reprodução automática da mídia.'
        },
        { force: true }
      );
    }
  }

  if (command === 'pause') {
    mediaElement.pause();
  }

  if (command === 'stop') {
    mediaElement.pause();
    mediaElement.currentTime = 0;
  }

  if (command === 'restart') {
    mediaElement.pause();
    mediaElement.currentTime = 0;

    try {
      await mediaElement.play();
    } catch (_error) {
      void postTransportTelemetry(
        {
          status: 'error',
          currentTime: mediaElement.currentTime,
          duration: mediaElement.duration,
          error: 'O navegador bloqueou a reprodução automática da mídia.'
        },
        { force: true }
      );
    }
  }

  if (command === 'seek_relative') {
    const deltaSeconds = Number(mediaTransport.lastCommand?.deltaSeconds) || 0;
    mediaElement.currentTime = clampSeekTarget(mediaElement.currentTime + deltaSeconds, mediaElement);
  }

  if (command === 'seek_to') {
    const targetTime = Number(mediaTransport.lastCommand?.targetTime);

    if (Number.isFinite(targetTime)) {
      mediaElement.currentTime = clampSeekTarget(targetTime, mediaElement);
    }
  }

  lastAppliedCommandVersion = mediaTransport.commandVersion;

  void postTransportTelemetry(
    {
      status: getMediaPlaybackStatus(),
      currentTime: mediaElement.currentTime,
      duration: mediaElement.duration
    },
    { force: true }
  );
}

async function renderMediaTransport(mediaTransport) {
  currentMediaTransport = mediaTransport || null;

  if (!mediaTransport) {
    return;
  }

  await applyMediaTransportCommand(mediaTransport);
}

function renderPoll(activePoll) {
  currentActivePoll = activePoll || null;
  syncPollBoxMode(activePoll || null);

  if (!activePoll) {
    pollLayer.classList.add('is-hidden');
    pollTitle.textContent = '';
    pollMeta.textContent = '';
    clearChildren(pollOptions);
    lastPollId = null;
    return;
  }

  pollLayer.classList.remove('is-hidden');
  pollTitle.textContent = activePoll.title;

  if (activePoll.id !== lastPollId) {
    clearChildren(pollOptions);
  }

  clearChildren(pollOptions);

  const maxVotes = Math.max(1, ...activePoll.options.map((option) => option.votes));

  for (const option of activePoll.options) {
    const optionNode = document.createElement('article');
    optionNode.className = 'poll-option';
    optionNode.style.backgroundColor = option.color || '#8ef2cf';

    const header = document.createElement('div');
    header.className = 'poll-option-header';

    const label = document.createElement('strong');
    label.textContent = option.label;

    const total = document.createElement('span');
    total.textContent = `${option.votes} voto(s)`;

    header.appendChild(label);
    header.appendChild(total);

    const track = document.createElement('div');
    track.className = 'poll-track';

    const fill = document.createElement('div');
    fill.className = 'poll-fill';
    fill.style.width = `${Math.max(6, (option.votes / maxVotes) * 100)}%`;
    fill.style.background = '#ffffff';

    track.appendChild(fill);
    optionNode.appendChild(header);
    optionNode.appendChild(track);
    pollOptions.appendChild(optionNode);
  }

  pollMeta.textContent = `${activePoll.totalVoters} votante(s)`;
  lastPollId = activePoll.id;
}

function renderDebugEmptyState(liveItem, activePoll) {
  if (!debugEmptyState || !isDebugMode) {
    return;
  }

  if (debugEmptyText) {
    if (overlayMode === 'message') {
      debugEmptyText.textContent = 'Nenhum item no ar neste momento.';
    } else if (overlayMode === 'poll') {
      debugEmptyText.textContent = 'Nenhuma enquete ativa neste momento.';
    } else {
      debugEmptyText.textContent = 'Nenhum item no ar e nenhuma enquete ativa neste momento.';
    }
  }

  const shouldShowEmpty =
    (shouldRenderMessages ? !liveItem : true) && (shouldRenderPolls ? !activePoll : true);

  if (shouldShowEmpty) {
    debugEmptyState.classList.remove('is-hidden');
    return;
  }

  debugEmptyState.classList.add('is-hidden');
}

async function refreshOverlay() {
  try {
    const response = await fetch('/api/overlay/state', {
      headers: {
        accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    applyOverlaySettings(payload.settings);
    if (shouldRenderMessages) {
      renderLiveItem(payload.liveItem || null);
      await renderMediaTransport(payload.mediaTransport || null);
    } else {
      renderLiveItem(null);
    }

    if (shouldRenderPolls) {
      renderPoll(payload.activePoll || null);
    } else {
      renderPoll(null);
    }

    renderDebugEmptyState(payload.liveItem || null, payload.activePoll || null);
  } catch (_error) {
    // O overlay precisa falhar silenciosamente e tentar novamente.
  }
}

void refreshOverlay();
window.setInterval(() => {
  void refreshOverlay();
}, POLL_INTERVAL_MS);

window.addEventListener('resize', () => {
  if (!currentLiveItem) {
    syncPollBoxMode(currentActivePoll);
    return;
  }

  if (currentMessageBoxMode === 'auto') {
    syncMessageBoxMode(currentLiveItem, false);
  }

  fitLiveMessageLayout(currentLiveItem);

  if (currentPollBoxMode === 'auto') {
    syncPollBoxMode(currentActivePoll);
  }
});
