function createTextItem({ id, author, phone, content, receivedAt, source, status = 'pending', pollVote = null }) {
  return {
    id,
    type: 'text',
    author,
    phone,
    content,
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
  media,
  status = 'pending'
}) {
  return {
    id,
    type: 'image',
    author,
    phone,
    content,
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
  media,
  status = 'pending'
}) {
  return {
    id,
    type: 'audio',
    author,
    phone,
    content,
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
  media,
  status = 'pending'
}) {
  return {
    id,
    type: 'video',
    author,
    phone,
    content,
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

function createRestoredState(initialState) {
  return {
    sequence: Number.isInteger(initialState?.sequence) ? initialState.sequence : 0,
    pollSequence: Number.isInteger(initialState?.pollSequence) ? initialState.pollSequence : 0,
    moderationQueue: Array.isArray(initialState?.moderationQueue)
      ? initialState.moderationQueue.map((item) => cloneItem(item))
      : [],
    liveItemId: initialState?.liveItemId || null,
    activePoll: clonePoll(initialState?.activePoll),
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
    activePoll: restoredState.activePoll
  };
  const pollVotesByPhone = new Map(restoredState.pollVotesByPhoneEntries);

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

  return {
    getSnapshot() {
      return serializeState();
    },

    getPersistenceSnapshot,

    enqueueTextMessage({ author, phone, content, source = 'manual' }) {
      return enqueueModerationItem(() => {
        const item = createTextItem({
          id: nextId(),
          author: author?.trim() || 'Anonimo',
          phone: phone?.trim() || 'Nao informado',
          content: content?.trim() || '',
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

    enqueueImageMessage({ author, phone, content, source = 'whatsapp', media }) {
      return enqueueModerationItem(() =>
        createImageItem({
          id: nextId(),
          author: author?.trim() || 'Anonimo',
          phone: phone?.trim() || 'Nao informado',
          content: content?.trim() || '',
          receivedAt: new Date().toISOString(),
          source,
          media
        })
      );
    },

    enqueueAudioMessage({ author, phone, content, source = 'whatsapp', media }) {
      return enqueueModerationItem(() =>
        createAudioItem({
          id: nextId(),
          author: author?.trim() || 'Anonimo',
          phone: phone?.trim() || 'Nao informado',
          content: content?.trim() || '',
          receivedAt: new Date().toISOString(),
          source,
          media
        })
      );
    },

    enqueueVideoMessage({ author, phone, content, source = 'whatsapp', media }) {
      return enqueueModerationItem(() =>
        createVideoItem({
          id: nextId(),
          author: author?.trim() || 'Anonimo',
          phone: phone?.trim() || 'Nao informado',
          content: content?.trim() || '',
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
      emitChange();
      return serializeState();
    },

    clearOperationalState() {
      state.moderationQueue = [];
      state.liveItem = null;
      state.activePoll = null;
      pollVotesByPhone.clear();
      emitChange();
      return serializeState();
    }
  };
}
