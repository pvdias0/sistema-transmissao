import { useEffect, useState } from 'react'

const REFRESH_INTERVAL_MS = 4000

const INITIAL_FORM = {
  author: '',
  phone: '',
  content: ''
}

const INITIAL_POLL_FORM = {
  title: '',
  options: ['', '']
}

const OVERLAY_FONT_OPTIONS = [
  'Segoe UI',
  'Arial',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia'
]

function formatBooleanLabel(value) {
  return value ? 'Ativo' : 'Inativo'
}

function formatLastCheck(value) {
  if (!value) {
    return 'Aguardando primeira leitura'
  }

  return new Date(value).toLocaleTimeString('pt-BR')
}

function formatTimestamp(value) {
  if (!value) {
    return 'Sem horario'
  }

  return new Date(value).toLocaleString('pt-BR')
}

function formatDurationLabel(valueInSeconds) {
  if (!Number.isFinite(valueInSeconds) || valueInSeconds < 0) {
    return '--:--'
  }

  const totalSeconds = Math.floor(valueInSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function resolveMediaUrl(baseUrl, publicPath) {
  if (!baseUrl || !publicPath) {
    return ''
  }

  return new URL(publicPath, `${baseUrl}/`).toString()
}

function getStatusLabel(status) {
  if (status === 'pending') return 'Pendente'
  if (status === 'approved') return 'Aprovado'
  if (status === 'rejected') return 'Rejeitado'
  if (status === 'on_air') return 'No ar'
  return status
}

function getItemTypeLabel(type) {
  if (type === 'text') return 'Texto'
  if (type === 'image') return 'Imagem'
  if (type === 'audio') return 'Audio'
  if (type === 'video') return 'Video'
  return 'Item'
}

function getTransportStatusLabel(status) {
  if (status === 'cued') return 'Pronto'
  if (status === 'playing') return 'Tocando'
  if (status === 'paused') return 'Pausado'
  if (status === 'stopped') return 'Parado'
  if (status === 'ended') return 'Finalizado'
  if (status === 'error') return 'Erro'
  return status || 'Indisponivel'
}

function getPreviewGuidance(status) {
  if (status === 'approved') {
    return 'Este item ja foi aprovado. Se fizer sentido, coloque no ar quando quiser.'
  }

  if (status === 'on_air') {
    return 'Este item ja esta no ar agora.'
  }

  if (status === 'rejected') {
    return 'Este item foi rejeitado e nao volta para a transmissao.'
  }

  return 'Revise com calma e escolha a acao logo abaixo.'
}

function getWhatsAppConnectionLabel(status) {
  if (status === 'idle') return 'Nao iniciado'
  if (status === 'starting') return 'Iniciando'
  if (status === 'recovering') return 'Recuperando sessao local'
  if (status === 'qr_ready') return 'Aguardando leitura do QR'
  if (status === 'authenticated') return 'Autenticado'
  if (status === 'ready') return 'Conectado'
  if (status === 'auth_failure') return 'Falha de autenticacao'
  if (status === 'disconnected') return 'Desconectado'
  if (status === 'error') return 'Erro'
  return status || 'Indisponivel'
}

function getWhatsAppStatusClass(status) {
  if (status === 'ready' || status === 'authenticated') return 'ok'
  if (status === 'qr_ready' || status === 'starting' || status === 'recovering') return 'pending'
  if (status === 'auth_failure' || status === 'error' || status === 'disconnected') return 'offline'
  return 'neutral'
}

function App() {
  const [shellInfo, setShellInfo] = useState(null)
  const [config, setConfig] = useState(null)
  const [backendHealth, setBackendHealth] = useState({
    ok: false,
    error: 'Backend ainda nao consultado',
    lastCheckedAt: null
  })
  const [backendStatus, setBackendStatus] = useState(null)
  const [moderationState, setModerationState] = useState(null)
  const [whatsAppStatus, setWhatsAppStatus] = useState(null)
  const [submissionError, setSubmissionError] = useState('')
  const [actionError, setActionError] = useState('')
  const [cleanupError, setCleanupError] = useState('')
  const [cleanupSuccess, setCleanupSuccess] = useState('')
  const [overlaySettingsError, setOverlaySettingsError] = useState('')
  const [mediaTransportError, setMediaTransportError] = useState('')
  const [whatsAppError, setWhatsAppError] = useState('')
  const [pollError, setPollError] = useState('')
  const [networkAccessError, setNetworkAccessError] = useState('')
  const [networkAccessSuccess, setNetworkAccessSuccess] = useState('')
  const [formState, setFormState] = useState(INITIAL_FORM)
  const [pollForm, setPollForm] = useState(INITIAL_POLL_FORM)
  const [queueSearch, setQueueSearch] = useState('')
  const [fontOverrideForm, setFontOverrideForm] = useState({})
  const [overlayAppearanceDrafts, setOverlayAppearanceDrafts] = useState({})
  const [activeTab, setActiveTab] = useState('operation')
  const [previewItemId, setPreviewItemId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isActing, setIsActing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecoveringRuntime, setIsRecoveringRuntime] = useState(false)
  const [isCreatingPoll, setIsCreatingPoll] = useState(false)
  const [isClosingPoll, setIsClosingPoll] = useState(false)
  const [isCleaningRuntime, setIsCleaningRuntime] = useState(false)
  const [isUpdatingOverlaySettings, setIsUpdatingOverlaySettings] = useState(false)
  const [isSendingMediaCommand, setIsSendingMediaCommand] = useState(false)
  const [isEnablingNetworkAccess, setIsEnablingNetworkAccess] = useState(false)

  useEffect(() => {
    let intervalId
    let active = true

    async function refreshAll() {
      const [healthResult, statusResult, moderationResult, whatsappResult] = await Promise.all([
        window.api.backend.getHealth(),
        window.api.backend.getStatus(),
        window.api.backend.getModerationState(),
        window.api.whatsapp.getStatus()
      ])

      if (!active) {
        return
      }

      setBackendHealth({
        ...healthResult,
        lastCheckedAt: new Date().toISOString()
      })

      setBackendStatus(statusResult.ok ? statusResult.data : null)
      setModerationState(moderationResult.ok ? moderationResult.data : null)
      setWhatsAppStatus(whatsappResult.ok ? whatsappResult.data : null)

      if (!moderationResult.ok && !actionError) {
        setActionError(moderationResult.error)
      }

      if (!whatsappResult.ok && !whatsAppError) {
        setWhatsAppError(whatsappResult.error)
      }
    }

    async function bootstrap() {
      const [nextShellInfo, nextConfig] = await Promise.all([
        window.api.system.getShellInfo(),
        window.api.system.getConfig()
      ])

      if (!active) {
        return
      }

      setShellInfo(nextShellInfo)
      setConfig(nextConfig)

      await refreshAll()
      intervalId = window.setInterval(refreshAll, REFRESH_INTERVAL_MS)
    }

    bootstrap()

    return () => {
      active = false

      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [actionError, whatsAppError])

  async function refreshOperationalState() {
    const [statusResult, moderationResult, whatsappResult] = await Promise.all([
      window.api.backend.getStatus(),
      window.api.backend.getModerationState(),
      window.api.whatsapp.getStatus()
    ])

    setBackendStatus(statusResult.ok ? statusResult.data : null)
    setModerationState(moderationResult.ok ? moderationResult.data : null)
    setWhatsAppStatus(whatsappResult.ok ? whatsappResult.data : null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmissionError('')
    setIsSubmitting(true)

    const result = await window.api.backend.createTestMessage(formState)

    setIsSubmitting(false)

    if (!result.ok) {
      setSubmissionError(result.error)
      return
    }

    setFormState(INITIAL_FORM)
    await refreshOperationalState()
  }

  async function runItemAction(action) {
    setActionError('')
    setIsActing(true)

    const result = await action()

    setIsActing(false)

    if (!result.ok) {
      setActionError(result.error)
      return
    }

    await refreshOperationalState()
  }

  async function handleConnectWhatsApp() {
    setWhatsAppError('')
    setIsConnecting(true)

    const result = await window.api.whatsapp.connect()

    setIsConnecting(false)

    if (!result.ok) {
      setWhatsAppError(result.error)
      return
    }

    await refreshOperationalState()
  }

  async function handleResetWhatsAppRuntime() {
    setWhatsAppError('')
    setIsRecoveringRuntime(true)

    const result = await window.api.whatsapp.resetRuntime()

    setIsRecoveringRuntime(false)

    if (!result.ok) {
      setWhatsAppError(result.error)
      return
    }

    await refreshOperationalState()
  }

  async function handleCreatePoll(event) {
    event.preventDefault()
    setPollError('')
    setIsCreatingPoll(true)

    const payload = {
      title: pollForm.title,
      options: pollForm.options
    }

    const result = await window.api.polls.create(payload)

    setIsCreatingPoll(false)

    if (!result.ok) {
      setPollError(result.error)
      return
    }

    setPollForm(INITIAL_POLL_FORM)
    await refreshOperationalState()
  }

  async function handleCleanupRuntime() {
    setCleanupError('')
    setCleanupSuccess('')
    setIsCleaningRuntime(true)

    const result = await window.api.backend.cleanup()

    setIsCleaningRuntime(false)

    if (!result.ok) {
      setCleanupError(result.error)
      return
    }

    setCleanupSuccess(
      'Dados operacionais apagados. A sessao autenticada do WhatsApp foi preservada.'
    )
    await refreshOperationalState()
  }

  async function handleClosePoll() {
    setPollError('')
    setIsClosingPoll(true)

    const result = await window.api.polls.close()

    setIsClosingPoll(false)

    if (!result.ok) {
      setPollError(result.error)
      return
    }

    await refreshOperationalState()
  }

  async function handleEnableNetworkAccess() {
    setNetworkAccessError('')
    setNetworkAccessSuccess('')
    setIsEnablingNetworkAccess(true)

    const port = backendStatus?.transport?.port
    const result = await window.api.system.enableNetworkAccess({ port })

    setIsEnablingNetworkAccess(false)

    if (!result?.ok) {
      setNetworkAccessError(result?.error || 'Falha ao habilitar acesso na rede.')
      return
    }

    setNetworkAccessSuccess(
      result?.data?.restarted
        ? 'Acesso na rede liberado. O backend foi reiniciado para ouvir na rede local.'
        : 'Acesso na rede liberado. Reinicie o backend com HOST=0.0.0.0 para ouvir na rede.'
    )
    await refreshOperationalState()
  }

  async function handleOverlayFontSizeChange(target, delta) {
    const overlaySettings = backendStatus?.overlaySettings

    if (!overlaySettings) {
      return
    }

    setOverlaySettingsError('')
    setIsUpdatingOverlaySettings(true)

    const nextValue =
      target === 'message'
        ? overlaySettings.message.fontSize + delta
        : overlaySettings.poll.fontSize + delta

    const result = await window.api.overlay.updateSettings({
      [target]: {
        fontSize: nextValue
      }
    })

    setIsUpdatingOverlaySettings(false)

    if (!result.ok) {
      setOverlaySettingsError(result.error)
      return
    }

    setFontOverrideForm((current) => ({
      ...current,
      [target]: String(nextValue)
    }))
    await refreshOperationalState()
  }

  function handleFontOverrideInputChange(target, value) {
    setFontOverrideForm((current) => ({
      ...current,
      [target]: value
    }))
  }

  async function commitOverlayFontSize(target) {
    const overlaySettings = backendStatus?.overlaySettings

    if (!overlaySettings) {
      return
    }

    const rawValue =
      fontOverrideForm[target] ??
      String(
        target === 'message' ? overlaySettings.message.fontSize : overlaySettings.poll.fontSize
      )
    const parsedValue = Number.parseInt(rawValue, 10)

    if (!Number.isInteger(parsedValue)) {
      setOverlaySettingsError('Informe um valor numerico valido para a fonte do overlay.')
      return
    }

    setOverlaySettingsError('')
    setIsUpdatingOverlaySettings(true)

    const result = await window.api.overlay.updateSettings({
      [target]: {
        fontSize: parsedValue
      }
    })

    setIsUpdatingOverlaySettings(false)

    if (!result.ok) {
      setOverlaySettingsError(result.error)
      return
    }

    setFontOverrideForm((current) => ({
      ...current,
      [target]: String(parsedValue)
    }))
    await refreshOperationalState()
  }

  async function updateOverlaySettings(target, partialSettings) {
    setOverlaySettingsError('')
    setIsUpdatingOverlaySettings(true)

    const result = await window.api.overlay.updateSettings({
      [target]: partialSettings
    })

    setIsUpdatingOverlaySettings(false)

    if (!result.ok) {
      setOverlaySettingsError(result.error)
      return false
    }

    await refreshOperationalState()
    return true
  }

  function handleOverlayAppearanceDraftChange(target, key, value) {
    setOverlayAppearanceDrafts((current) => ({
      ...current,
      [target]: {
        ...(current[target] || {}),
        [key]: value
      }
    }))
  }

  async function handleOverlayAppearanceChange(target, key, value) {
    await updateOverlaySettings(target, {
      [key]: value
    })
  }

  async function commitOverlayBackgroundImage(target) {
    const nextValue =
      overlayAppearanceDrafts?.[target]?.backgroundImageUrl ??
      backendStatus?.overlaySettings?.[target]?.backgroundImageUrl ??
      ''

    const didUpdate = await updateOverlaySettings(target, {
      backgroundImageUrl: nextValue
    })

    if (!didUpdate) {
      return
    }

    setOverlayAppearanceDrafts((current) => ({
      ...current,
      [target]: {
        ...(current[target] || {}),
        backgroundImageUrl: nextValue
      }
    }))
  }

  async function clearOverlayBackgroundImage(target) {
    const didUpdate = await updateOverlaySettings(target, {
      backgroundImageUrl: ''
    })

    if (!didUpdate) {
      return
    }

    setOverlayAppearanceDrafts((current) => ({
      ...current,
      [target]: {
        ...(current[target] || {}),
        backgroundImageUrl: ''
      }
    }))
  }

  async function copyToClipboard(value) {
    if (!value) {
      return
    }

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
        return
      } catch {
        // fallback below
      }
    }

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()

    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(textarea)
    }
  }

  async function handleMediaTransportCommand(action, payload = {}) {
    setMediaTransportError('')
    setIsSendingMediaCommand(true)

    const result = await window.api.media.sendCommand({
      action,
      ...payload
    })

    setIsSendingMediaCommand(false)

    if (!result.ok) {
      setMediaTransportError(result.error)
      return
    }

    await refreshOperationalState()
  }

  function handlePollOptionChange(index, value) {
    setPollForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? value : option
      )
    }))
  }

  function handleAddPollOption() {
    setPollForm((current) => {
      if (current.options.length >= 5) {
        return current
      }

      return {
        ...current,
        options: [...current.options, '']
      }
    })
  }

  function handleRemovePollOption(index) {
    setPollForm((current) => {
      if (current.options.length <= 2) {
        return current
      }

      return {
        ...current,
        options: current.options.filter((_option, optionIndex) => optionIndex !== index)
      }
    })
  }

  const queue = moderationState?.moderationQueue || []
  const liveItem = moderationState?.liveItem
  const normalizedQueueSearch = queueSearch.trim().toLowerCase()
  const filteredQueue = normalizedQueueSearch
    ? queue.filter((item) => {
        const searchableText = [
          item.author,
          item.phone,
          item.content,
          item.source,
          item.pollVote?.optionLabel
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchableText.includes(normalizedQueueSearch)
      })
    : queue
  const previewItem = queue.find((item) => item.id === previewItemId) || null
  const mediaTransport = moderationState?.mediaTransport
  const counts = moderationState?.counts
  const activePoll = moderationState?.activePoll
  const whatsappStatusClass = getWhatsAppStatusClass(whatsAppStatus?.connection)
  const backendBaseUrl = config?.backendBaseUrl || ''
  const canRecoverWhatsAppSession =
    whatsAppStatus?.connection === 'error' || whatsAppStatus?.connection === 'disconnected'
  const hasControllableMedia =
    Boolean(liveItem) &&
    (liveItem?.type === 'audio' || liveItem?.type === 'video') &&
    mediaTransport?.itemId === liveItem?.id
  const isVideoTransport = hasControllableMedia && liveItem?.type === 'video'
  const isMediaPlaying = mediaTransport?.status === 'playing'
  const mediaDuration = Number.isFinite(mediaTransport?.duration) ? mediaTransport.duration : 0
  const mediaCurrentTime = Number.isFinite(mediaTransport?.currentTime)
    ? mediaTransport.currentTime
    : 0
  const localOverlayMessageUrl =
    backendStatus?.transport?.overlayMessageUrl || backendStatus?.transport?.overlayUrl || ''
  const localOverlayPollUrl =
    backendStatus?.transport?.overlayPollUrl || backendStatus?.transport?.overlayUrl || ''
  const networkOverlayMessageUrl =
    backendStatus?.transport?.overlayNetworkMessageUrl ||
    backendStatus?.transport?.overlayNetworkUrl ||
    ''
  const networkOverlayPollUrl =
    backendStatus?.transport?.overlayNetworkPollUrl ||
    backendStatus?.transport?.overlayNetworkUrl ||
    ''

  function getOverlayFontInputValue(target) {
    const overlaySettings = backendStatus?.overlaySettings

    if (!overlaySettings) {
      return fontOverrideForm[target] ?? ''
    }

    if (fontOverrideForm[target] !== undefined) {
      return fontOverrideForm[target]
    }

    return String(
      target === 'message' ? overlaySettings.message.fontSize : overlaySettings.poll.fontSize
    )
  }

  function getOverlayAppearanceValue(target, key) {
    const draftValue = overlayAppearanceDrafts?.[target]?.[key]

    if (draftValue !== undefined) {
      return draftValue
    }

    return backendStatus?.overlaySettings?.[target]?.[key] ?? ''
  }

  return (
    <main className="app-shell operator-shell">
      <section className="operator-hero">
        <div className="operator-hero-copy">
          <p className="eyebrow">Central do operador</p>
          <h1>Receba, revise e publique sem se perder na tela</h1>
          <p className="hero-text">
            A operacao principal foi reorganizada em um fluxo simples: mensagens recebidas,
            preview, decisao e transmissao.
          </p>
        </div>

        <div className="operator-hero-actions">
          <span className={`status-pill status-pill-${whatsappStatusClass}`}>
            WhatsApp {getWhatsAppConnectionLabel(whatsAppStatus?.connection)}
          </span>
          <button
            className="primary-button"
            disabled={
              isConnecting ||
              isRecoveringRuntime ||
              whatsAppStatus?.connection === 'starting' ||
              whatsAppStatus?.connection === 'recovering' ||
              whatsAppStatus?.connection === 'ready'
            }
            onClick={handleConnectWhatsApp}
            type="button"
          >
            {isConnecting ? 'Conectando...' : 'Conectar WhatsApp'}
          </button>
          <button
            className="ghost-button"
            disabled={!canRecoverWhatsAppSession || isRecoveringRuntime || isConnecting}
            onClick={handleResetWhatsAppRuntime}
            type="button"
          >
            {isRecoveringRuntime ? 'Recuperando...' : 'Recuperar sessao'}
          </button>
        </div>
      </section>

      <section className="operator-summary">
        <article className="summary-card">
          <span className="summary-label">Mensagens aguardando</span>
          <strong className="summary-value">{counts?.pending ?? 0}</strong>
          <span className="summary-note">Itens que ainda precisam de decisao.</span>
        </article>
        <article className="summary-card">
          <span className="summary-label">Preview atual</span>
          <strong className="summary-value">{previewItem ? previewItem.author : 'Nenhum item'}</strong>
          <span className="summary-note">
            {previewItem ? `${getItemTypeLabel(previewItem.type)} pronto para revisao` : 'Escolha um item da fila para revisar.'}
          </span>
        </article>
        <article className="summary-card">
          <span className="summary-label">No ar</span>
          <strong className="summary-value">{liveItem ? liveItem.author : 'Nada ao vivo'}</strong>
          <span className="summary-note">
            {liveItem ? `${getItemTypeLabel(liveItem.type)} exibido agora` : 'Nenhum item enviado para a transmissao.'}
          </span>
        </article>
        <article className="summary-card">
          <span className="summary-label">Enquete</span>
          <strong className="summary-value">{activePoll ? activePoll.title : 'Sem enquete'}</strong>
          <span className="summary-note">
            {activePoll ? `${activePoll.totalVoters} voto(s) unicos registrados` : 'Crie uma enquete quando precisar abrir votacao.'}
          </span>
        </article>
      </section>

      {(whatsAppError || actionError || overlaySettingsError || pollError) ? (
        <section className="operator-alerts">
          {whatsAppError ? <p className="inline-error">{whatsAppError}</p> : null}
          {actionError ? <p className="inline-error">{actionError}</p> : null}
          {overlaySettingsError ? <p className="inline-error">{overlaySettingsError}</p> : null}
          {pollError ? <p className="inline-error">{pollError}</p> : null}
        </section>
      ) : null}

      <section className="operator-tabs">
        <button
          className={`operator-tab-button ${activeTab === 'operation' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('operation')}
          type="button"
        >
          Operacao
        </button>
        <button
          className={`operator-tab-button ${activeTab === 'polls' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('polls')}
          type="button"
        >
          Enquete
        </button>
        <button
          className={`operator-tab-button ${activeTab === 'overlay' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('overlay')}
          type="button"
        >
          Overlay
        </button>
        <button
          className={`operator-tab-button ${activeTab === 'system' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('system')}
          type="button"
        >
          Sistema
        </button>
      </section>

      {activeTab === 'operation' ? (
        <section className="operator-layout">
          <section className="operator-main">
            <article className="operator-panel">
              <div className="operator-panel-header">
                <div>
                  <p className="card-kicker">Entrada</p>
                  <h2>Mensagens recebidas</h2>
                  <p className="panel-subtitle">
                    Escolha um item para revisar no preview antes de aprovar, rejeitar ou colocar no ar.
                  </p>
                </div>
                <span className="mini-badge">{filteredQueue.length} item(ns)</span>
              </div>

              <div className="operator-queue-toolbar">
                <label className="queue-search-field">
                  <span>Buscar na fila</span>
                  <input
                    onChange={(event) => setQueueSearch(event.target.value)}
                    placeholder="Procure por nome, grupo, numero ou trecho da mensagem"
                    type="text"
                    value={queueSearch}
                  />
                </label>
                {queueSearch ? (
                  <button className="ghost-button" onClick={() => setQueueSearch('')} type="button">
                    Limpar busca
                  </button>
                ) : null}
              </div>

              {filteredQueue.length ? (
                <div className="operator-queue-scroll">
                  <div className="operator-queue">
                    {filteredQueue.map((item) => {
                      const isSelected = previewItemId === item.id

                      return (
                        <article
                          className={`operator-queue-item ${isSelected ? 'is-selected' : ''}`}
                          key={item.id}
                          onClick={() => setPreviewItemId(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setPreviewItemId(item.id)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="operator-queue-main">
                            <div className="operator-queue-copy">
                              <div className="operator-queue-topline">
                                <h3>{item.author}</h3>
                                <span className={`mini-status mini-status-${item.status}`}>
                                  {getStatusLabel(item.status)}
                                </span>
                              </div>
                              <p className="operator-queue-phone">{item.phone}</p>
                              <p className="operator-queue-snippet">
                                {item.content?.trim()
                                  ? item.content
                                  : `${getItemTypeLabel(item.type)} recebida sem texto adicional.`}
                              </p>
                              <div className="queue-meta">
                                <span>{formatTimestamp(item.receivedAt)}</span>
                                <span>{getItemTypeLabel(item.type)}</span>
                                <span>{item.source}</span>
                              </div>
                              {item.pollVote ? (
                                <p className="vote-match">
                                  Voto reconhecido em {item.pollVote.optionLabel}
                                  {item.pollVote.wasReplacement ? ' e substituiu o anterior.' : '.'}
                                </p>
                              ) : null}
                            </div>
                            <div className="operator-queue-actions">
                              <button
                                className={isSelected ? 'primary-button' : 'ghost-button'}
                                disabled={isSelected}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setPreviewItemId(item.id)
                                }}
                                type="button"
                              >
                                {isSelected ? 'Selecionado' : 'Revisar'}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="empty-state">
                  {queue.length
                    ? 'Nenhum item encontrado com esse termo de busca.'
                    : 'Nenhuma mensagem na fila. Quando o WhatsApp receber novas entradas, elas aparecem aqui.'}
                </p>
              )}
            </article>

            <article className="operator-panel">
              <div className="operator-panel-header">
                <div>
                  <p className="card-kicker">Revisao</p>
                  <h2>Preview do operador</h2>
                  <p className="panel-subtitle">
                    Este e o lugar para ouvir, assistir ou ler antes de decidir.
                  </p>
                </div>
                <button
                  className="ghost-button"
                  disabled={!previewItem}
                  onClick={() => setPreviewItemId(null)}
                  type="button"
                >
                  Limpar preview
                </button>
              </div>

              {previewItem ? (
                <article className="live-item live-item-preview">
                  <div className="live-item-header">
                    <div>
                      <h3>{previewItem.author}</h3>
                      <p>{previewItem.phone}</p>
                    </div>
                    <span className={`mini-status mini-status-${previewItem.status}`}>
                      {getStatusLabel(previewItem.status)}
                    </span>
                  </div>

                  {previewItem.type === 'image' && previewItem.media?.publicPath ? (
                    <img
                      alt={`Preview de imagem enviada por ${previewItem.author}`}
                      className="queue-image queue-image-preview"
                      src={resolveMediaUrl(backendBaseUrl, previewItem.media.publicPath)}
                    />
                  ) : null}

                  {previewItem.type === 'audio' && previewItem.media?.publicPath ? (
                    <audio
                      className="queue-audio queue-audio-preview"
                      controls
                      preload="metadata"
                      src={resolveMediaUrl(backendBaseUrl, previewItem.media.publicPath)}
                    >
                      Seu navegador nao conseguiu carregar este audio.
                    </audio>
                  ) : null}

                  {previewItem.type === 'video' && previewItem.media?.publicPath ? (
                    <video
                      className="queue-video queue-video-preview"
                      controls
                      preload="metadata"
                      src={resolveMediaUrl(backendBaseUrl, previewItem.media.publicPath)}
                    >
                      Seu navegador nao conseguiu carregar este video.
                    </video>
                  ) : null}

                  {previewItem.content ? <p className="queue-message">{previewItem.content}</p> : null}

                  <div className="queue-meta">
                    <span>{formatTimestamp(previewItem.receivedAt)}</span>
                    <span>{getItemTypeLabel(previewItem.type)}</span>
                  </div>

                  <p className="preview-guidance">{getPreviewGuidance(previewItem.status)}</p>

                  <div className="preview-decision-bar">
                    <button
                      className="ghost-button"
                      disabled={
                        isActing ||
                        previewItem.status === 'approved' ||
                        previewItem.status === 'on_air'
                      }
                      onClick={() =>
                        runItemAction(() => window.api.backend.approveItem(previewItem.id))
                      }
                      type="button"
                    >
                      Aprovar
                    </button>
                    <button
                      className="ghost-button ghost-button-danger"
                      disabled={isActing || previewItem.status === 'rejected'}
                      onClick={() =>
                        runItemAction(() => window.api.backend.rejectItem(previewItem.id))
                      }
                      type="button"
                    >
                      Rejeitar
                    </button>
                    <button
                      className="primary-button"
                      disabled={isActing || previewItem.status === 'rejected'}
                      onClick={() =>
                        runItemAction(() => window.api.backend.setLiveItem(previewItem.id))
                      }
                      type="button"
                    >
                      Colocar no ar
                    </button>
                  </div>
                </article>
              ) : (
                <p className="empty-state">
                  Escolha um item em <code>Mensagens recebidas</code> para abrir o preview.
                </p>
              )}
            </article>
          </section>

          <aside className="operator-side">
            <article className="operator-panel">
              <div className="operator-panel-header">
                <div>
                  <p className="card-kicker">Transmissao</p>
                  <h2>No ar</h2>
                  <p className="panel-subtitle">
                    O que esta sendo exibido agora no overlay usado pelo vMix.
                  </p>
                </div>
                <button
                  className="ghost-button"
                  disabled={isActing || !liveItem}
                  onClick={() => runItemAction(() => window.api.backend.clearLiveItem())}
                  type="button"
                >
                  Limpar
                </button>
              </div>

              {liveItem ? (
                <article className="live-item">
                  <div className="live-item-header">
                    <div>
                      <h3>{liveItem.author}</h3>
                      <p>{liveItem.phone}</p>
                    </div>
                    <span className="status-pill ok">No ar</span>
                  </div>

                  {liveItem.type === 'image' && liveItem.media?.publicPath ? (
                    <img
                      alt={`Imagem no ar enviada por ${liveItem.author}`}
                      className="queue-image queue-image-preview"
                      src={resolveMediaUrl(backendBaseUrl, liveItem.media.publicPath)}
                    />
                  ) : null}
                  {liveItem.type === 'audio' && liveItem.media?.publicPath ? (
                    <div className="transport-media-hint">
                      Audio no ar controlado pela barra de reproducao abaixo.
                    </div>
                  ) : null}
                  {liveItem.type === 'video' && liveItem.media?.publicPath ? (
                    <video
                      className="queue-video queue-video-preview"
                      preload="metadata"
                      src={resolveMediaUrl(backendBaseUrl, liveItem.media.publicPath)}
                    >
                      Seu navegador nao conseguiu carregar este video.
                    </video>
                  ) : null}
                  {liveItem.content ? <p className="queue-message">{liveItem.content}</p> : null}

                  <div className="queue-meta">
                    <span>{formatTimestamp(liveItem.receivedAt)}</span>
                    <span>{getItemTypeLabel(liveItem.type)}</span>
                  </div>

                  {hasControllableMedia ? (
                    <div className="transport-panel">
                      <div className="transport-summary">
                        <div>
                          <p className="transport-kicker">Controle de reproducao</p>
                          <p className="transport-status">
                            {liveItem.type === 'video' ? 'Video' : 'Audio'} |{' '}
                            {getTransportStatusLabel(mediaTransport?.status)} |{' '}
                            {formatDurationLabel(mediaCurrentTime)} /{' '}
                            {formatDurationLabel(mediaDuration)}
                          </p>
                        </div>
                        {mediaTransport?.error ? (
                          <p className="inline-error">{mediaTransport.error}</p>
                        ) : null}
                      </div>

                      {mediaTransportError ? <p className="inline-error">{mediaTransportError}</p> : null}

                      <div className="transport-bar">
                        <button
                          className="primary-button transport-toggle"
                          disabled={isSendingMediaCommand}
                          onClick={() =>
                            void handleMediaTransportCommand(isMediaPlaying ? 'pause' : 'play')
                          }
                          type="button"
                        >
                          {isMediaPlaying ? 'Pause' : 'Play'}
                        </button>

                        {mediaDuration > 0 ? (
                          <input
                            className="transport-slider"
                            disabled={isSendingMediaCommand}
                            max={mediaDuration}
                            min="0"
                            onChange={(event) =>
                              void handleMediaTransportCommand('seek_to', {
                                targetTime: Number(event.target.value)
                              })
                            }
                            step="0.1"
                            type="range"
                            value={Math.min(mediaCurrentTime, mediaDuration)}
                          />
                        ) : (
                          <div className="transport-slider-placeholder">
                            Carregando duracao da midia...
                          </div>
                        )}
                      </div>

                      {isVideoTransport ? (
                        <div className="transport-actions transport-actions-secondary">
                          <button
                            className="ghost-button"
                            disabled={isSendingMediaCommand}
                            onClick={() =>
                              void handleMediaTransportCommand('seek_relative', {
                                deltaSeconds: -10
                              })
                            }
                            type="button"
                          >
                            -10s
                          </button>
                          <button
                            className="ghost-button"
                            disabled={isSendingMediaCommand}
                            onClick={() =>
                              void handleMediaTransportCommand('seek_relative', {
                                deltaSeconds: 10
                              })
                            }
                            type="button"
                          >
                            +10s
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ) : (
                <p className="empty-state">
                  Nenhum item foi enviado para a transmissao ainda.
                </p>
              )}
            </article>
          </aside>
        </section>
      ) : null}

      {activeTab === 'polls' ? (
        <section className="operator-tab-panel-stack">
          <article className="operator-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Enquete</p>
                <h2>Votacao ao vivo</h2>
                <p className="panel-subtitle">
                  Crie rapidamente uma enquete e acompanhe os votos recebidos.
                </p>
              </div>
              <button
                className="ghost-button"
                disabled={isClosingPoll || !activePoll}
                onClick={handleClosePoll}
                type="button"
              >
                {isClosingPoll ? 'Encerrando...' : 'Encerrar'}
              </button>
            </div>

            {activePoll ? (
              <div className="poll-details">
                <p className="poll-title">{activePoll.title}</p>
                <p className="poll-meta">
                  {activePoll.totalVoters} voto(s) unicos. O ultimo voto de cada numero vale.
                </p>
                <div className="poll-options">
                  {activePoll.options.map((option) => (
                    <article className="poll-option" key={option.id}>
                      <div className="poll-option-header">
                        <strong>{option.label}</strong>
                        <span>{option.votes} voto(s)</span>
                      </div>
                      <p className="poll-aliases">Aceita: {option.aliases.join(', ')}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <form className="message-form poll-form compact-form" onSubmit={handleCreatePoll}>
                <label className="field field-full">
                  <span>Titulo</span>
                  <input
                    onChange={(event) => setPollForm({ ...pollForm, title: event.target.value })}
                    placeholder="Ex.: Qual abertura voce prefere?"
                    type="text"
                    value={pollForm.title}
                  />
                </label>
                <div className="poll-options-builder field field-full">
                  <div className="poll-options-builder-list">
                    {pollForm.options.map((option, index) => (
                      <div className="poll-option-editor" key={`poll-option-input-${index}`}>
                        <label className="field">
                          <span>Opcao {index + 1}</span>
                          <input
                            onChange={(event) => handlePollOptionChange(index, event.target.value)}
                            placeholder={`Ex.: Opcao ${index + 1}`}
                            type="text"
                            value={option}
                          />
                        </label>
                        <button
                          className="ghost-button"
                          disabled={pollForm.options.length <= 2}
                          onClick={() => handleRemovePollOption(index)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="poll-options-builder-actions">
                    <button
                      className="ghost-button"
                      disabled={pollForm.options.length >= 5}
                      onClick={handleAddPollOption}
                      type="button"
                    >
                      Adicionar opcao
                    </button>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="primary-button" disabled={isCreatingPoll} type="submit">
                    {isCreatingPoll ? 'Criando...' : 'Criar enquete'}
                  </button>
                </div>
              </form>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'overlay' ? (
        <section className="operator-tab-panel-stack">
          <article className="operator-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Overlay</p>
                <h2>Personalizacao rapida</h2>
                <p className="panel-subtitle">
                  Ajuste fonte, cores e fundo das mensagens e enquetes sem editar codigo.
                </p>
              </div>
            </div>

            <div className="overlay-style-grid">
              <section className="overlay-style-card overlay-style-card-wide">
                <div className="overlay-style-header">
                  <div>
                    <p className="card-kicker">Transmissao</p>
                    <h3>Fundo geral</h3>
                  </div>
                </div>

                <div className="overlay-style-fields">
                  <label className="field field-full">
                    <span>Fundo da transmissao</span>
                    <select
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange(
                          'canvas',
                          'enabled',
                          event.target.value === 'enabled'
                        )
                      }
                      value={getOverlayAppearanceValue('canvas', 'enabled') ? 'enabled' : 'transparent'}
                    >
                      <option value="transparent">Transparente (padrao)</option>
                      <option value="enabled">Aplicar fundo customizado</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Cor de fundo</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange(
                          'canvas',
                          'backgroundColor',
                          event.target.value
                        )
                      }
                      type="color"
                      value={getOverlayAppearanceValue('canvas', 'backgroundColor')}
                    />
                  </label>

                  <label className="field field-full">
                    <span>Imagem de fundo opcional</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onBlur={() => void commitOverlayBackgroundImage('canvas')}
                      onChange={(event) =>
                        handleOverlayAppearanceDraftChange(
                          'canvas',
                          'backgroundImageUrl',
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void commitOverlayBackgroundImage('canvas')
                        }
                      }}
                      placeholder="Cole uma URL de imagem. Deixe vazio para usar so a cor."
                      type="text"
                      value={getOverlayAppearanceValue('canvas', 'backgroundImageUrl')}
                    />
                  </label>
                </div>

                <div className="overlay-style-actions">
                  <button
                    className="ghost-button"
                    disabled={isUpdatingOverlaySettings}
                    onClick={() => void clearOverlayBackgroundImage('canvas')}
                    type="button"
                  >
                    Remover imagem do fundo
                  </button>
                </div>
              </section>

              <section className="overlay-style-card">
                <div className="overlay-style-header">
                  <div>
                    <p className="card-kicker">Mensagem</p>
                    <h3>Card da mensagem</h3>
                  </div>
                </div>

                <div className="font-control-group">
                  <div className="font-control-row">
                    <span className="font-control-label">Tamanho</span>
                    <div className="font-control-actions">
                      <button
                        className="ghost-button"
                        disabled={isUpdatingOverlaySettings}
                        onClick={() => handleOverlayFontSizeChange('message', -2)}
                        type="button"
                      >
                        A-
                      </button>
                      <label className="font-control-input-shell">
                        <input
                          className="font-control-input"
                          disabled={isUpdatingOverlaySettings}
                          inputMode="numeric"
                          onBlur={() => void commitOverlayFontSize('message')}
                          onChange={(event) =>
                            handleFontOverrideInputChange('message', event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void commitOverlayFontSize('message')
                            }
                          }}
                          type="text"
                          value={getOverlayFontInputValue('message')}
                        />
                        <span className="font-control-unit">px</span>
                      </label>
                      <button
                        className="ghost-button"
                        disabled={isUpdatingOverlaySettings}
                        onClick={() => handleOverlayFontSizeChange('message', 2)}
                        type="button"
                      >
                        A+
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overlay-style-fields">
                  <label className="field">
                    <span>Fonte</span>
                    <select
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange(
                          'message',
                          'fontFamily',
                          event.target.value
                        )
                      }
                      value={getOverlayAppearanceValue('message', 'fontFamily')}
                    >
                      {OVERLAY_FONT_OPTIONS.map((fontOption) => (
                        <option key={fontOption} value={fontOption}>
                          {fontOption}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Cor do texto</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange(
                          'message',
                          'textColor',
                          event.target.value
                        )
                      }
                      type="color"
                      value={getOverlayAppearanceValue('message', 'textColor')}
                    />
                  </label>

                  <label className="field">
                    <span>Cor de destaque</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange(
                          'message',
                          'accentColor',
                          event.target.value
                        )
                      }
                      type="color"
                      value={getOverlayAppearanceValue('message', 'accentColor')}
                    />
                  </label>

                  <label className="field">
                    <span>Cor de fundo</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange(
                          'message',
                          'backgroundColor',
                          event.target.value
                        )
                      }
                      type="color"
                      value={getOverlayAppearanceValue('message', 'backgroundColor')}
                    />
                  </label>

                  <label className="field field-full">
                    <span>Imagem de fundo opcional</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onBlur={() => void commitOverlayBackgroundImage('message')}
                      onChange={(event) =>
                        handleOverlayAppearanceDraftChange(
                          'message',
                          'backgroundImageUrl',
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void commitOverlayBackgroundImage('message')
                        }
                      }}
                      placeholder="Cole uma URL de imagem. Deixe vazio para usar so a cor."
                      type="text"
                      value={getOverlayAppearanceValue('message', 'backgroundImageUrl')}
                    />
                  </label>
                </div>

                <div className="overlay-style-actions">
                  <button
                    className="ghost-button"
                    disabled={isUpdatingOverlaySettings}
                    onClick={() => void clearOverlayBackgroundImage('message')}
                    type="button"
                  >
                    Remover imagem da mensagem
                  </button>
                </div>
              </section>

              <section className="overlay-style-card">
                <div className="overlay-style-header">
                  <div>
                    <p className="card-kicker">Enquete</p>
                    <h3>Card da enquete</h3>
                  </div>
                </div>

                <div className="font-control-group">
                  <div className="font-control-row">
                    <span className="font-control-label">Tamanho</span>
                    <div className="font-control-actions">
                      <button
                        className="ghost-button"
                        disabled={isUpdatingOverlaySettings}
                        onClick={() => handleOverlayFontSizeChange('poll', -2)}
                        type="button"
                      >
                        A-
                      </button>
                      <label className="font-control-input-shell">
                        <input
                          className="font-control-input"
                          disabled={isUpdatingOverlaySettings}
                          inputMode="numeric"
                          onBlur={() => void commitOverlayFontSize('poll')}
                          onChange={(event) =>
                            handleFontOverrideInputChange('poll', event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void commitOverlayFontSize('poll')
                            }
                          }}
                          type="text"
                          value={getOverlayFontInputValue('poll')}
                        />
                        <span className="font-control-unit">px</span>
                      </label>
                      <button
                        className="ghost-button"
                        disabled={isUpdatingOverlaySettings}
                        onClick={() => handleOverlayFontSizeChange('poll', 2)}
                        type="button"
                      >
                        A+
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overlay-style-fields">
                  <label className="field">
                    <span>Fonte</span>
                    <select
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange('poll', 'fontFamily', event.target.value)
                      }
                      value={getOverlayAppearanceValue('poll', 'fontFamily')}
                    >
                      {OVERLAY_FONT_OPTIONS.map((fontOption) => (
                        <option key={fontOption} value={fontOption}>
                          {fontOption}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Cor do texto</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange('poll', 'textColor', event.target.value)
                      }
                      type="color"
                      value={getOverlayAppearanceValue('poll', 'textColor')}
                    />
                  </label>

                  <label className="field">
                    <span>Cor de destaque</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange('poll', 'accentColor', event.target.value)
                      }
                      type="color"
                      value={getOverlayAppearanceValue('poll', 'accentColor')}
                    />
                  </label>

                  <label className="field">
                    <span>Cor de fundo</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onChange={(event) =>
                        void handleOverlayAppearanceChange(
                          'poll',
                          'backgroundColor',
                          event.target.value
                        )
                      }
                      type="color"
                      value={getOverlayAppearanceValue('poll', 'backgroundColor')}
                    />
                  </label>

                  <label className="field field-full">
                    <span>Imagem de fundo opcional</span>
                    <input
                      disabled={isUpdatingOverlaySettings}
                      onBlur={() => void commitOverlayBackgroundImage('poll')}
                      onChange={(event) =>
                        handleOverlayAppearanceDraftChange(
                          'poll',
                          'backgroundImageUrl',
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void commitOverlayBackgroundImage('poll')
                        }
                      }}
                      placeholder="Cole uma URL de imagem. Deixe vazio para usar so a cor."
                      type="text"
                      value={getOverlayAppearanceValue('poll', 'backgroundImageUrl')}
                    />
                  </label>
                </div>

                <div className="overlay-style-actions">
                  <button
                    className="ghost-button"
                    disabled={isUpdatingOverlaySettings}
                    onClick={() => void clearOverlayBackgroundImage('poll')}
                    type="button"
                  >
                    Remover imagem da enquete
                  </button>
                </div>
              </section>
            </div>
          </article>

          <article className="operator-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Saida</p>
                <h2>Uso no vMix</h2>
                <p className="panel-subtitle">
                  Use estas URLs no Browser Input e mantenha o ajuste visual centralizado aqui. Na
                  primeira execucao, permita a conexao quando o Windows solicitar acesso a rede.
                </p>
              </div>
            </div>

            <dl className="definition-list compact">
              <div>
                <dt>Overlay (mensagens - local)</dt>
                <dd className="url-row">
                  <span>{localOverlayMessageUrl || 'Carregando...'}</span>
                  <button
                    className="ghost-button ghost-button-compact"
                    disabled={!localOverlayMessageUrl}
                    onClick={() => void copyToClipboard(localOverlayMessageUrl)}
                    type="button"
                  >
                    Copiar
                  </button>
                </dd>
              </div>
              <div>
                <dt>Overlay (mensagens - rede)</dt>
                <dd className="url-row">
                  <span>{networkOverlayMessageUrl || 'Indisponivel'}</span>
                  <button
                    className="ghost-button ghost-button-compact"
                    disabled={!networkOverlayMessageUrl}
                    onClick={() => void copyToClipboard(networkOverlayMessageUrl)}
                    type="button"
                  >
                    Copiar
                  </button>
                </dd>
              </div>
              <div>
                <dt>Overlay (enquete - local)</dt>
                <dd className="url-row">
                  <span>{localOverlayPollUrl || 'Carregando...'}</span>
                  <button
                    className="ghost-button ghost-button-compact"
                    disabled={!localOverlayPollUrl}
                    onClick={() => void copyToClipboard(localOverlayPollUrl)}
                    type="button"
                  >
                    Copiar
                  </button>
                </dd>
              </div>
              <div>
                <dt>Overlay (enquete - rede)</dt>
                <dd className="url-row">
                  <span>{networkOverlayPollUrl || 'Indisponivel'}</span>
                  <button
                    className="ghost-button ghost-button-compact"
                    disabled={!networkOverlayPollUrl}
                    onClick={() => void copyToClipboard(networkOverlayPollUrl)}
                    type="button"
                  >
                    Copiar
                  </button>
                </dd>
              </div>
              <div>
                <dt>Status do backend</dt>
                <dd>{backendHealth.ok ? 'Online' : backendHealth.error}</dd>
              </div>
            </dl>

            <div className="network-access-panel">
              <p className="network-access-note">
                Para compartilhar o overlay na rede local, permita a conexao no firewall do Windows.
              </p>
              <div className="network-access-actions">
                <button
                  className="ghost-button"
                  disabled={isEnablingNetworkAccess || !backendStatus?.transport?.port}
                  onClick={() => void handleEnableNetworkAccess()}
                  type="button"
                >
                  {isEnablingNetworkAccess ? 'Solicitando permissao...' : 'Permitir acesso na rede'}
                </button>
                {networkAccessSuccess ? (
                  <p className="vote-match">{networkAccessSuccess}</p>
                ) : null}
                {networkAccessError ? <p className="inline-error">{networkAccessError}</p> : null}
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'system' ? (
        <section className="operator-tab-panel-stack">
          <article className="operator-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Sistema</p>
                <h2>Manutencao e apoio</h2>
                <p className="panel-subtitle">
                  Recursos tecnicos e operacionais menos frequentes, separados da rotina principal.
                </p>
              </div>
            </div>

            <div className="operator-details-grid operator-details-grid-open">
              <section className="status-block">
                <h3>WhatsApp</h3>
                <dl className="definition-list compact">
                  <div>
                    <dt>Conta</dt>
                    <dd>{whatsAppStatus?.account?.pushname || 'Nao autenticada'}</dd>
                  </div>
                  <div>
                    <dt>Ultimo evento</dt>
                    <dd>
                      {whatsAppStatus?.lastEventAt
                        ? formatTimestamp(whatsAppStatus.lastEventAt)
                        : 'Sem eventos'}
                    </dd>
                  </div>
                  <div>
                    <dt>QR code</dt>
                    <dd>{whatsAppStatus?.qrCodeDataUrl ? 'Disponivel' : 'Nao exibido'}</dd>
                  </div>
                </dl>
                {whatsAppStatus?.qrCodeDataUrl ? (
                  <img
                    alt="QR code do WhatsApp"
                    className="qr-image"
                    src={whatsAppStatus.qrCodeDataUrl}
                  />
                ) : null}
              </section>

              <section className="status-block">
                <h3>Transmissao</h3>
                <dl className="definition-list compact">
                  <div>
                    <dt>Overlay (mensagens - local)</dt>
                    <dd className="url-row">
                      <span>{localOverlayMessageUrl || 'Carregando...'}</span>
                      <button
                        className="ghost-button ghost-button-compact"
                        disabled={!localOverlayMessageUrl}
                        onClick={() => void copyToClipboard(localOverlayMessageUrl)}
                        type="button"
                      >
                        Copiar
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Overlay (mensagens - rede)</dt>
                    <dd className="url-row">
                      <span>{networkOverlayMessageUrl || 'Indisponivel'}</span>
                      <button
                        className="ghost-button ghost-button-compact"
                        disabled={!networkOverlayMessageUrl}
                        onClick={() => void copyToClipboard(networkOverlayMessageUrl)}
                        type="button"
                      >
                        Copiar
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Overlay (enquete - local)</dt>
                    <dd className="url-row">
                      <span>{localOverlayPollUrl || 'Carregando...'}</span>
                      <button
                        className="ghost-button ghost-button-compact"
                        disabled={!localOverlayPollUrl}
                        onClick={() => void copyToClipboard(localOverlayPollUrl)}
                        type="button"
                      >
                        Copiar
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Overlay (enquete - rede)</dt>
                    <dd className="url-row">
                      <span>{networkOverlayPollUrl || 'Indisponivel'}</span>
                      <button
                        className="ghost-button ghost-button-compact"
                        disabled={!networkOverlayPollUrl}
                        onClick={() => void copyToClipboard(networkOverlayPollUrl)}
                        type="button"
                      >
                        Copiar
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Ultima checagem</dt>
                    <dd>{formatLastCheck(backendHealth.lastCheckedAt)}</dd>
                  </div>
                  <div>
                    <dt>Sistema</dt>
                    <dd>{backendHealth.ok ? 'Online' : backendHealth.error}</dd>
                  </div>
                </dl>
              </section>

              <section className="status-block">
                <h3>Recuperacao e limpeza</h3>
                {cleanupError ? <p className="inline-error">{cleanupError}</p> : null}
                {cleanupSuccess ? <p className="vote-match">{cleanupSuccess}</p> : null}
                <dl className="definition-list compact">
                  <div>
                    <dt>Estado restaurado</dt>
                    <dd>{backendStatus?.runtime?.restoredFromDisk ? 'Sim' : 'Nao'}</dd>
                  </div>
                  <div>
                    <dt>Ultima persistencia</dt>
                    <dd>
                      {backendStatus?.runtime?.persistedAt
                        ? formatTimestamp(backendStatus.runtime.persistedAt)
                        : 'Sem persistencia anterior'}
                    </dd>
                  </div>
                </dl>
                <div className="form-actions">
                  <button
                    className="ghost-button ghost-button-danger"
                    disabled={isCleaningRuntime}
                    onClick={handleCleanupRuntime}
                    type="button"
                  >
                    {isCleaningRuntime ? 'Limpando...' : 'Limpar fila e midias locais'}
                  </button>
                </div>
              </section>

              <section className="status-block">
                <h3>Entrada manual de teste</h3>
                <form className="message-form compact-form" onSubmit={handleSubmit}>
                  <label className="field">
                    <span>Autor</span>
                    <input
                      onChange={(event) => setFormState({ ...formState, author: event.target.value })}
                      placeholder="Ex.: Maria Souza"
                      type="text"
                      value={formState.author}
                    />
                  </label>
                  <label className="field">
                    <span>Telefone</span>
                    <input
                      onChange={(event) => setFormState({ ...formState, phone: event.target.value })}
                      placeholder="Ex.: 11999990000"
                      type="text"
                      value={formState.phone}
                    />
                  </label>
                  <label className="field field-full">
                    <span>Mensagem</span>
                    <textarea
                      onChange={(event) => setFormState({ ...formState, content: event.target.value })}
                      placeholder="Use esta area somente para validar o fluxo local."
                      rows={4}
                      value={formState.content}
                    />
                  </label>
                  {submissionError ? <p className="inline-error">{submissionError}</p> : null}
                  <div className="form-actions">
                    <button className="primary-button" disabled={isSubmitting} type="submit">
                      {isSubmitting ? 'Adicionando...' : 'Adicionar a fila'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="status-block">
                <h3>Aplicativo</h3>
                <dl className="definition-list compact">
                  <div>
                    <dt>App</dt>
                    <dd>{shellInfo?.appName || 'Carregando...'}</dd>
                  </div>
                  <div>
                    <dt>Versao</dt>
                    <dd>{shellInfo?.appVersion || 'Carregando...'}</dd>
                  </div>
                  <div>
                    <dt>Plataforma</dt>
                    <dd>{shellInfo?.platform || 'Carregando...'}</dd>
                  </div>
                  <div>
                    <dt>Modo dev</dt>
                    <dd>{formatBooleanLabel(Boolean(shellInfo?.isDev))}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </article>
        </section>
      ) : null}
    </main>
  )
}

export default App
