const POLL_INTERVAL_MS = 700;
const searchParams = new URLSearchParams(window.location.search);
const isDebugMode = searchParams.get('debug') === '1';

const liveCard = document.getElementById('live-card');
const liveAuthor = document.getElementById('live-author');
const liveMessage = document.getElementById('live-message');
const liveMediaRegion = document.getElementById('live-media-region');
const debugEmptyState = document.getElementById('debug-empty-state');
const pollLayer = document.getElementById('poll-layer');
const pollTitle = document.getElementById('poll-title');
const pollOptions = document.getElementById('poll-options');
const pollMeta = document.getElementById('poll-meta');

let lastLiveItemId = null;
let lastPollId = null;
let currentOverlaySettings = null;
let currentLiveItem = null;

if (isDebugMode) {
  document.body.classList.add('debug-mode');
}

function resolveMediaUrl(publicPath) {
  return new URL(publicPath, window.location.origin).toString();
}

function applyOverlaySettings(settings) {
  const messageFontSize = settings?.message?.fontSize ?? 32;
  const pollFontSize = settings?.poll?.fontSize ?? 24;
  currentOverlaySettings = settings ?? null;

  document.documentElement.style.setProperty('--message-font-size', `${messageFontSize}px`);
  document.documentElement.style.setProperty('--message-font-size-effective', `${messageFontSize}px`);
  document.documentElement.style.setProperty('--poll-font-size', `${pollFontSize}px`);
}

function getBaseMessageFontSize() {
  return currentOverlaySettings?.message?.fontSize ?? 32;
}

function resetLiveMessageLayout() {
  liveCard.classList.remove('is-expanded', 'is-condensed');
  document.documentElement.style.setProperty(
    '--message-font-size-effective',
    `${getBaseMessageFontSize()}px`
  );
}

function fitLiveMessageLayout(liveItem) {
  resetLiveMessageLayout();

  if (!liveItem?.content) {
    return;
  }

  const lineBreakCount = (liveItem.content.match(/\n/g) || []).length;
  const contentLength = liveItem.content.trim().length;
  const shouldExpandEarly = contentLength > 210 || lineBreakCount >= 2;
  const minimumFontSize = 18;

  if (shouldExpandEarly) {
    liveCard.classList.add('is-expanded');
  }

  let effectiveFontSize = getBaseMessageFontSize();

  while (liveCard.scrollHeight > liveCard.clientHeight && effectiveFontSize > minimumFontSize) {
    effectiveFontSize -= 2;
    document.documentElement.style.setProperty(
      '--message-font-size-effective',
      `${effectiveFontSize}px`
    );
  }

  if (liveCard.scrollHeight > liveCard.clientHeight && !liveCard.classList.contains('is-expanded')) {
    liveCard.classList.add('is-expanded');
    effectiveFontSize = Math.min(effectiveFontSize, getBaseMessageFontSize());

    while (liveCard.scrollHeight > liveCard.clientHeight && effectiveFontSize > minimumFontSize) {
      effectiveFontSize -= 2;
      document.documentElement.style.setProperty(
        '--message-font-size-effective',
        `${effectiveFontSize}px`
      );
    }
  }

  if (liveCard.scrollHeight > liveCard.clientHeight) {
    liveCard.classList.add('is-condensed');

    while (liveCard.scrollHeight > liveCard.clientHeight && effectiveFontSize > minimumFontSize) {
      effectiveFontSize -= 1;
      document.documentElement.style.setProperty(
        '--message-font-size-effective',
        `${effectiveFontSize}px`
      );
    }
  }
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function createAudioShell(src) {
  const shell = document.createElement('div');
  shell.className = 'audio-shell';

  const visualizer = document.createElement('div');
  visualizer.className = 'audio-visualizer';

  for (let index = 0; index < 9; index += 1) {
    const bar = document.createElement('span');
    bar.className = 'audio-bar';
    visualizer.appendChild(bar);
  }

  const label = document.createElement('p');
  label.className = 'audio-label';
  label.textContent = 'Audio aprovado ao vivo';

  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.controls = false;
  audio.preload = 'auto';
  audio.src = src;

  shell.appendChild(visualizer);
  shell.appendChild(label);
  shell.appendChild(audio);

  return shell;
}

function createVideoElement(src) {
  const video = document.createElement('video');
  video.autoplay = true;
  video.controls = false;
  video.loop = false;
  video.muted = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;
  return video;
}

function createImageElement(src, alt) {
  const image = document.createElement('img');
  image.src = src;
  image.alt = alt;
  return image;
}

function renderLiveItem(liveItem) {
  currentLiveItem = liveItem || null;

  if (!liveItem) {
    liveCard.classList.add('is-hidden');
    liveAuthor.textContent = '';
    liveMessage.textContent = '';
    clearChildren(liveMediaRegion);
    resetLiveMessageLayout();
    lastLiveItemId = null;
    return;
  }

  liveCard.classList.remove('is-hidden');
  liveAuthor.textContent = `${liveItem.author || 'Anonimo'}${liveItem.phone ? ` | ${liveItem.phone}` : ''}`;
  liveMessage.textContent = liveItem.content || '';

  if (liveItem.id !== lastLiveItemId) {
    clearChildren(liveMediaRegion);

    if (liveItem.type === 'image' && liveItem.media?.publicPath) {
      liveMediaRegion.appendChild(
        createImageElement(resolveMediaUrl(liveItem.media.publicPath), `Imagem enviada por ${liveItem.author || 'Anonimo'}`)
      );
    }

    if (liveItem.type === 'audio' && liveItem.media?.publicPath) {
      liveMediaRegion.appendChild(createAudioShell(resolveMediaUrl(liveItem.media.publicPath)));
    }

    if (liveItem.type === 'video' && liveItem.media?.publicPath) {
      liveMediaRegion.appendChild(createVideoElement(resolveMediaUrl(liveItem.media.publicPath)));
    }
  }

  fitLiveMessageLayout(liveItem);
  lastLiveItemId = liveItem.id;
}

function renderPoll(activePoll) {
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

    track.appendChild(fill);
    optionNode.appendChild(header);
    optionNode.appendChild(track);
    pollOptions.appendChild(optionNode);
  }

  pollMeta.textContent = `${activePoll.totalVoters} votante(s) unicos | ultimo voto por numero vale`;
  lastPollId = activePoll.id;
}

function renderDebugEmptyState(liveItem, activePoll) {
  if (!debugEmptyState || !isDebugMode) {
    return;
  }

  if (!liveItem && !activePoll) {
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
    renderLiveItem(payload.liveItem || null);
    renderPoll(payload.activePoll || null);
    renderDebugEmptyState(payload.liveItem || null, payload.activePoll || null);
  } catch (_error) {
    // O overlay precisa falhar silenciosamente e tentar novamente.
  }
}

void refreshOverlay();
window.setInterval(refreshOverlay, POLL_INTERVAL_MS);

window.addEventListener('resize', () => {
  if (!currentLiveItem) {
    return;
  }

  fitLiveMessageLayout(currentLiveItem);
});
