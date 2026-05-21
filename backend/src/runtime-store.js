function createTextItem({
  id,
  author,
  phone,
  content,
  receivedAt,
  source,
  status = 'pending',
  pollVote = null,
  authorAvatarUrl = null
}) {
  return {
    id,
    type: 'text',
    author,
    phone,
    content,
    ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
    receivedAt,
    source,
    status,
    ...(pollVote ? { pollVote } : {})
  };
}

function createImageItem({
  id,
  author,
  phone,
  content,
  receivedAt,
  source,
  authorAvatarUrl = null,
  media,
  status = 'pending'
}) {
  return {
    id,
    type: 'image',
    author,
    phone,
    content,
    ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
    receivedAt,
    source,
    media,
    status
  };
}

function createAudioItem({
  id,
  author,
  phone,
  content,
  receivedAt,
  source,
  authorAvatarUrl = null,
  media,
  status = 'pending'
}) {
  return {
    id,
    type: 'audio',
    author,
    phone,
    content,
    ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
    receivedAt,
    source,
    media,
    status
  };
}

function createVideoItem({
  id,
  author,
  phone,
  content,
  receivedAt,
  source,
  authorAvatarUrl = null,
  media,
  status = 'pending'
}) {
  return {
    id,
    type: 'video',
    author,
    phone,
    content,
    ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
    receivedAt,
    source,
    media,
    status
  };
}

function normalizeVoteText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function buildOptionAliases(label, index) {
  const aliases = new Set();
  const normalizedLabel = normalizeVoteText(label);
  const letter = String.fromCharCode(65 + index);
  const number = String(index + 1);

  aliases.add(letter);
  aliases.add(number);

  if (normalizedLabel) {
    aliases.add(normalizedLabel);
  }

  return Array.from(aliases);
}

function cloneItem(item) {
  if (!item) {
    return null;
  }

  if (item.type === 'text') {
    return createTextItem(item);
  }

  if (item.type === 'image') {
    return createImageItem(item);
  }

  if (item.type === 'audio') {
    return createAudioItem(item);
  }

  if (item.type === 'video') {
    return createVideoItem(item);
  }

  return { ...item };
}

function clonePoll(poll) {
  if (!poll) {
    return null;
  }

  return {
    id: poll.id,
    title: poll.title,
    status: poll.status,
    createdAt: poll.createdAt,
    totalVoters: poll.totalVoters,
    options: Array.isArray(poll.options)
      ? poll.options.map((option) => ({
          id: option.id,
          label: option.label,
          aliases: Array.isArray(option.aliases) ? [...option.aliases] : [],
          votes: option.votes || 0
        }))
      : []
  };
}

function isTransportableMediaType(type) {
  return type === 'audio' || type === 'video';
}

function createMediaTransportForItem(item, previousTransport = null) {
  if (!item || !isTransportableMediaType(item.type)) {
    return null;
  }

  return {
    itemId: item.id,
    kind: item.type,
    status: 'cued',
    currentTime: 0,
    duration: null,
    commandVersion: (previousTransport?.commandVersion || 0) + 1,
    lastCommand: {
      type: 'cue',
      issuedAt: new Date().toISOString()
    },
    error: null,
    updatedAt: new Date().toISOString()
  };
}

function cloneMediaTransport(mediaTransport) {
  if (!mediaTransport) {
    return null;
  }

  return {
    itemId: mediaTransport.itemId || null,
    kind: mediaTransport.kind || null,
    status: mediaTransport.status || 'idle',
    currentTime: Number.isFinite(mediaTransport.currentTime) ? mediaTransport.currentTime : 0,
    duration: Number.isFinite(mediaTransport.duration) ? mediaTransport.duration : null,
    commandVersion: Number.isInteger(mediaTransport.commandVersion)
      ? mediaTransport.commandVersion
      : 0,
     lastCommand: mediaTransport.lastCommand
      ? {
          type: mediaTransport.lastCommand.type || null,
          deltaSeconds: Number.isFinite(mediaTransport.lastCommand.deltaSeconds)
            ? mediaTransport.lastCommand.deltaSeconds
            : undefined,
          targetTime: Number.isFinite(mediaTransport.lastCommand.targetTime)
            ? mediaTransport.lastCommand.targetTime
            : undefined,
          issuedAt: mediaTransport.lastCommand.issuedAt || null
        }
      : null,
    error: mediaTransport.error || null,
    updatedAt: mediaTransport.updatedAt || null
  };
}

function createRestoredState(initialState) {
  return {
    sequence: Number.isInteger(initialState?.sequence) ? initialState.sequence : 0,
    pollSequence: Number.isInteger(initialState?.pollSequence) ? initialState.pollSequence : 0,
    moderationQueue: Array.isArray(initialState?.moderationQueue)
      ? initialState.moderationQueue.map((item) => cloneItem(item))
      : [],
    liveItemId: initialState?.liveItemId || null,
    activePoll: clonePoll(initialState?.activePoll),
    mediaTransport: cloneMediaTransport(initialState?.mediaTransport),
    pollVotesByPhoneEntries: Array.isArray(initialState?.pollVotesByPhoneEntries)
      ? initialState.pollVotesByPhoneEntries.filter(
          (entry) => Array.isArray(entry) && entry.length === 2 && entry[0] && entry[1]
        )
      : []
  };
}

export function createRuntimeStore({ initialState = null, onChange = null } = {}) {
  const restoredState = createRestoredState(initialState);

  let sequence = restoredState.sequence;
  let pollSequence = restoredState.pollSequence;

  const state = {
    moderationQueue: restoredState.moderationQueue,
    liveItem:
      restoredState.moderationQueue.find((item) => item.id === restoredState.liveItemId) || null,
    activePoll: restoredState.activePoll,
    mediaTransport: restoredState.mediaTransport
  };
  const pollVotesByPhone = new Map(restoredState.pollVotesByPhoneEntries);

  if (!state.liveItem || !isTransportableMediaType(state.liveItem.type)) {
    state.mediaTransport = null;
  } else if (state.mediaTransport?.itemId !== state.liveItem.id) {
    state.mediaTransport = createMediaTransportForItem(state.liveItem, state.mediaTransport);
  }

  function nextId() {
    sequence += 1;
    return `msg-${String(sequence).padStart(4, '0')}`;
  }

  function nextPollId() {
    pollSequence += 1;
    return `poll-${String(pollSequence).padStart(4, '0')}`;
  }

  function getItemById(id) {
    return state.moderationQueue.find((item) => item.id === id) || null;
  }

  function serializePoll(poll) {
    return clonePoll(poll);
  }

  function getPersistenceSnapshot() {
    return {
      sequence,
      pollSequence,
      moderationQueue: state.moderationQueue.map((item) => cloneItem(item)),
      liveItemId: state.liveItem?.id || null,
      activePoll: serializePoll(state.activePoll),
      mediaTransport: cloneMediaTransport(state.mediaTransport),
      pollVotesByPhoneEntries: Array.from(pollVotesByPhone.entries())
    };
  }

  function emitChange() {
    onChange?.(getPersistenceSnapshot());
  }

  function findMatchingPollOption(content) {
    if (!state.activePoll) {
      return null;
    }

    const normalized = normalizeVoteText(content);

    if (!normalized) {
      return null;
    }

    return (
      state.activePoll.options.find((option) =>
        option.aliases.some((alias) => normalizeVoteText(alias) === normalized)
      ) || null
    );
  }

  function applyVote(phone, content) {
    if (!state.activePoll) {
      return null;
    }

    const matchingOption = findMatchingPollOption(content);

    if (!matchingOption) {
      return null;
    }

    const voterKey = phone?.trim() || 'anonimo';
    const previousVoteOptionId = pollVotesByPhone.get(voterKey);

    if (previousVoteOptionId && previousVoteOptionId !== matchingOption.id) {
      const previousOption = state.activePoll.options.find((option) => option.id === previousVoteOptionId);

      if (previousOption && previousOption.votes > 0) {
        previousOption.votes -= 1;
      }
    }

    if (!previousVoteOptionId || previousVoteOptionId !== matchingOption.id) {
      matchingOption.votes += 1;
      pollVotesByPhone.set(voterKey, matchingOption.id);
    }

    state.activePoll.totalVoters = pollVotesByPhone.size;

    return {
      pollId: state.activePoll.id,
      optionId: matchingOption.id,
      optionLabel: matchingOption.label,
      wasReplacement: Boolean(previousVoteOptionId) && previousVoteOptionId !== matchingOption.id
    };
  }

  function serializeState() {
    return {
      moderationQueue: state.moderationQueue.map((item) => cloneItem(item)),
      liveItem: cloneItem(state.liveItem),
      mediaTransport: cloneMediaTransport(state.mediaTransport),
      activePoll: serializePoll(state.activePoll),
      counts: {
        pending: state.moderationQueue.filter((item) => item.status === 'pending').length,
        approved: state.moderationQueue.filter((item) => item.status === 'approved').length,
        rejected: state.moderationQueue.filter((item) => item.status === 'rejected').length
      }
    };
  }

  function enqueueModerationItem(itemFactory) {
    const item = itemFactory();
    state.moderationQueue.unshift(item);
    emitChange();
    return cloneItem(item);
  }

  function clearMediaTransport() {
    state.mediaTransport = null;
  }

  function issueMediaCommand(commandType, payload = {}) {
    if (!state.liveItem || !isTransportableMediaType(state.liveItem.type)) {
      return null;
    }

    if (!state.mediaTransport || state.mediaTransport.itemId !== state.liveItem.id) {
      state.mediaTransport = createMediaTransportForItem(state.liveItem, state.mediaTransport);
    }

    const currentTime = Number.isFinite(state.mediaTransport.currentTime)
      ? state.mediaTransport.currentTime
      : 0;
    const duration = Number.isFinite(state.mediaTransport.duration)
      ? state.mediaTransport.duration
      : null;
    const nextCommandVersion = (state.mediaTransport.commandVersion || 0) + 1;
    const updatedAt = new Date().toISOString();
    const nextTransport = {
      ...state.mediaTransport,
      itemId: state.liveItem.id,
      kind: state.liveItem.type,
      commandVersion: nextCommandVersion,
      lastCommand: {
        type: commandType,
        ...(Number.isFinite(payload.deltaSeconds)
          ? { deltaSeconds: payload.deltaSeconds }
          : {}),
        ...(Number.isFinite(payload.targetTime)
          ? { targetTime: payload.targetTime }
          : {}),
        issuedAt: updatedAt
      },
      error: null,
      updatedAt
    };

    if (commandType === 'play') {
      nextTransport.status = 'playing';
    }

    if (commandType === 'pause') {
      nextTransport.status = 'paused';
    }

    if (commandType === 'stop') {
      nextTransport.status = 'stopped';
      nextTransport.currentTime = 0;
    }

    if (commandType === 'restart') {
      nextTransport.status = 'playing';
      nextTransport.currentTime = 0;
    }

    if (commandType === 'seek_relative') {
      const unclampedTargetTime = currentTime + payload.deltaSeconds;
      const maxDuration = Number.isFinite(duration) ? duration : Number.POSITIVE_INFINITY;
      nextTransport.currentTime = Math.max(0, Math.min(maxDuration, unclampedTargetTime));
    }

    if (commandType === 'seek_to') {
      const maxDuration = Number.isFinite(duration) ? duration : Number.POSITIVE_INFINITY;
      nextTransport.currentTime = Math.max(0, Math.min(maxDuration, payload.targetTime));
    }

    state.mediaTransport = nextTransport;
    emitChange();
    return cloneMediaTransport(state.mediaTransport);
  }

  return {
    getSnapshot() {
      return serializeState();
    },

    getPersistenceSnapshot,

    enqueueTextMessage({ author, phone, content, source = 'manual', authorAvatarUrl = null }) {
      return enqueueModerationItem(() => {
        const item = createTextItem({
          id: nextId(),
          author: author?.trim() || 'Anonimo',
          phone: phone?.trim() || 'Nao informado',
          content: content?.trim() || '',
          authorAvatarUrl: authorAvatarUrl?.trim() || null,
          receivedAt: new Date().toISOString(),
          source
        });
        const pollVote = applyVote(item.phone, item.content);

        if (pollVote) {
          item.pollVote = pollVote;
        }

        return item;
      });
    },

    enqueueImageMessage({ author, phone, content, source = 'whatsapp', media, authorAvatarUrl = null }) {
      return enqueueModerationItem(() =>
        createImageItem({
          id: nextId(),
          author: author?.trim() || 'Anonimo',
          phone: phone?.trim() || 'Nao informado',
          content: content?.trim() || '',
          authorAvatarUrl: authorAvatarUrl?.trim() || null,
          receivedAt: new Date().toISOString(),
          source,
          media
        })
      );
    },

    enqueueAudioMessage({ author, phone, content, source = 'whatsapp', media, authorAvatarUrl = null }) {
      return enqueueModerationItem(() =>
        createAudioItem({
          id: nextId(),
          author: author?.trim() || 'Anonimo',
          phone: phone?.trim() || 'Nao informado',
          content: content?.trim() || '',
          authorAvatarUrl: authorAvatarUrl?.trim() || null,
          receivedAt: new Date().toISOString(),
          source,
          media
        })
      );
    },

    enqueueVideoMessage({ author, phone, content, source = 'whatsapp', media, authorAvatarUrl = null }) {
      return enqueueModerationItem(() =>
        createVideoItem({
          id: nextId(),
          author: author?.trim() || 'Anonimo',
          phone: phone?.trim() || 'Nao informado',
          content: content?.trim() || '',
          authorAvatarUrl: authorAvatarUrl?.trim() || null,
          receivedAt: new Date().toISOString(),
          source,
          media
        })
      );
    },

    createPoll({ title, options }) {
      pollVotesByPhone.clear();

      state.activePoll = {
        id: nextPollId(),
        title: title.trim(),
        status: 'active',
        createdAt: new Date().toISOString(),
        totalVoters: 0,
        options: options.map((label, index) => ({
          id: `option-${index + 1}`,
          label,
          aliases: buildOptionAliases(label, index),
          votes: 0
        }))
      };

      emitChange();
      return serializePoll(state.activePoll);
    },

    closePoll() {
      const closedPoll = serializePoll(state.activePoll);
      state.activePoll = null;
      pollVotesByPhone.clear();
      emitChange();
      return closedPoll;
    },

    approveItem(id) {
      const item = getItemById(id);

      if (!item) {
        return null;
      }

      item.status = 'approved';
      emitChange();
      return cloneItem(item);
    },

    rejectItem(id) {
      const item = getItemById(id);

      if (!item) {
        return null;
      }

      item.status = 'rejected';

      if (state.liveItem?.id === item.id) {
        state.liveItem = null;
        clearMediaTransport();
      }

      emitChange();
      return cloneItem(item);
    },

    setLiveItem(id) {
      const item = getItemById(id);

      if (!item) {
        return null;
      }

      if (state.liveItem && state.liveItem.id !== item.id) {
        const previousLiveItem = getItemById(state.liveItem.id);

        if (previousLiveItem && previousLiveItem.status === 'on_air') {
          previousLiveItem.status = 'approved';
        }
      }

      item.status = 'on_air';
      state.liveItem = item;
      state.mediaTransport = createMediaTransportForItem(item, state.mediaTransport);
      emitChange();
      return cloneItem(item);
    },

    clearLiveItem() {
      if (state.liveItem) {
        const queueItem = getItemById(state.liveItem.id);

        if (queueItem) {
          queueItem.status = 'approved';
        }
      }

      state.liveItem = null;
      clearMediaTransport();
      emitChange();
      return serializeState();
    },

    getMediaTransport() {
      return cloneMediaTransport(state.mediaTransport);
    },

    issueMediaCommand(commandType, payload = {}) {
      return issueMediaCommand(commandType, payload);
    },

    updateMediaTelemetry({ itemId, status, currentTime, duration, error = null }) {
      if (!state.mediaTransport || !state.liveItem) {
        return null;
      }

      if (state.mediaTransport.itemId !== itemId || state.liveItem.id !== itemId) {
        return null;
      }

      if (typeof status === 'string' && status.trim()) {
        state.mediaTransport.status = status;
      }

      if (Number.isFinite(currentTime)) {
        state.mediaTransport.currentTime = currentTime;
      }

      if (Number.isFinite(duration)) {
        state.mediaTransport.duration = duration;
      }

      state.mediaTransport.error = error || null;
      state.mediaTransport.updatedAt = new Date().toISOString();
      emitChange();
      return cloneMediaTransport(state.mediaTransport);
    },

    clearOperationalState() {
      state.moderationQueue = [];
      state.liveItem = null;
      state.activePoll = null;
      clearMediaTransport();
      pollVotesByPhone.clear();
      emitChange();
      return serializeState();
    }
  };
}
