import { useEffect, useState } from 'react'

const REFRESH_INTERVAL_MS = 4000

const INITIAL_FORM = {
  author: '',
  phone: '',
  content: ''
}

const INITIAL_POLL_FORM = {
  title: '',
  optionA: '',
  optionB: ''
}

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
  const [whatsAppError, setWhatsAppError] = useState('')
  const [pollError, setPollError] = useState('')
  const [formState, setFormState] = useState(INITIAL_FORM)
  const [pollForm, setPollForm] = useState(INITIAL_POLL_FORM)
  const [fontOverrideForm, setFontOverrideForm] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isActing, setIsActing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecoveringRuntime, setIsRecoveringRuntime] = useState(false)
  const [isCreatingPoll, setIsCreatingPoll] = useState(false)
  const [isClosingPoll, setIsClosingPoll] = useState(false)
  const [isCleaningRuntime, setIsCleaningRuntime] = useState(false)
  const [isUpdatingOverlaySettings, setIsUpdatingOverlaySettings] = useState(false)

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
      options: [pollForm.optionA, pollForm.optionB]
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

  const queue = moderationState?.moderationQueue || []
  const liveItem = moderationState?.liveItem
  const counts = moderationState?.counts
  const activePoll = moderationState?.activePoll
  const whatsappStatusClass = getWhatsAppStatusClass(whatsAppStatus?.connection)
  const backendBaseUrl = config?.backendBaseUrl || ''
  const canRecoverWhatsAppSession =
    whatsAppStatus?.connection === 'error' || whatsAppStatus?.connection === 'disconnected'

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

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">MVP em construcao</p>
          <h1>WhatsApp real conectado ao fluxo de moderacao</h1>
          <p className="hero-text">
            Esta fase integra sessao do WhatsApp via QR code e injeta texto, imagem, audio e video
            diretamente na fila local de moderacao.
          </p>
        </div>

        <div className="hero-badges">
          <span className="badge badge-accent">whatsapp-web.js</span>
          <span className="badge">Texto, imagem, audio e video</span>
          <span className="badge">Fila local + painel Electron</span>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Backend local</p>
              <h2>Saude do servico</h2>
            </div>
            <span className={`status-pill ${backendHealth.ok ? 'ok' : 'offline'}`}>
              {backendHealth.ok ? 'Online' : 'Offline'}
            </span>
          </div>

          <dl className="definition-list">
            <div>
              <dt>URL base</dt>
              <dd>{config?.backendBaseUrl || 'Carregando...'}</dd>
            </div>
            <div>
              <dt>Ultima checagem</dt>
              <dd>{formatLastCheck(backendHealth.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt>Resposta</dt>
              <dd>{backendHealth.ok ? backendHealth.data?.service : backendHealth.error}</dd>
            </div>
            <div>
              <dt>Ambiente</dt>
              <dd>{backendHealth.ok ? backendHealth.data?.environment : 'Indisponivel'}</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Runtime desktop</p>
              <h2>Shell do operador</h2>
            </div>
          </div>

          <dl className="definition-list">
            <div>
              <dt>Aplicativo</dt>
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
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Estado atual</p>
              <h2>Resumo de operacao</h2>
            </div>
          </div>

          <dl className="definition-list">
            <div>
              <dt>Pendentes</dt>
              <dd>{counts?.pending ?? 0}</dd>
            </div>
            <div>
              <dt>Aprovados</dt>
              <dd>{counts?.approved ?? 0}</dd>
            </div>
            <div>
              <dt>Rejeitados</dt>
              <dd>{counts?.rejected ?? 0}</dd>
            </div>
            <div>
              <dt>Fila total</dt>
              <dd>{backendStatus?.runtime?.queueSize ?? 0}</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Saida local</p>
              <h2>Overlay para vMix</h2>
            </div>
            <span className="status-pill ok">Overlay</span>
          </div>

          <dl className="definition-list">
            <div>
              <dt>URL do Browser Input</dt>
              <dd>{backendStatus?.transport?.overlayUrl || 'Carregando...'}</dd>
            </div>
            <div>
              <dt>Fonte</dt>
              <dd>Live slot + enquete ativa</dd>
            </div>
            <div>
              <dt>Atualizacao</dt>
              <dd>Polling local sub-segundo</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{backendStatus?.features?.overlay || 'Carregando...'}</dd>
            </div>
          </dl>

          {overlaySettingsError ? <p className="inline-error">{overlaySettingsError}</p> : null}

          <div className="font-control-group">
            <div className="font-control-row">
              <span className="font-control-label">Fonte da mensagem</span>
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

            <div className="font-control-row">
              <span className="font-control-label">Fonte da enquete</span>
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
                    onChange={(event) => handleFontOverrideInputChange('poll', event.target.value)}
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
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Operacao local</p>
              <h2>Recuperacao e limpeza</h2>
            </div>
          </div>

          {cleanupError ? <p className="inline-error">{cleanupError}</p> : null}
          {cleanupSuccess ? <p className="vote-match">{cleanupSuccess}</p> : null}

          <dl className="definition-list">
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
            <div>
              <dt>Arquivo de estado</dt>
              <dd>{backendStatus?.runtime?.stateFilePath || 'Carregando...'}</dd>
            </div>
            <div>
              <dt>Limpeza preserva</dt>
              <dd>Sessao autenticada do WhatsApp</dd>
            </div>
          </dl>

          <div className="form-actions">
            <button
              className="ghost-button ghost-button-danger"
              disabled={isCleaningRuntime}
              onClick={handleCleanupRuntime}
              type="button"
            >
              {isCleaningRuntime ? 'Limpando dados...' : 'Limpar fila, enquete e midias locais'}
            </button>
          </div>
        </article>

        <article className="card wide-card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Sessao do WhatsApp</p>
              <h2>Conectar e monitorar</h2>
            </div>
            <span className={`status-pill status-pill-${whatsappStatusClass}`}>
              {getWhatsAppConnectionLabel(whatsAppStatus?.connection)}
            </span>
          </div>

          {whatsAppError ? <p className="inline-error">{whatsAppError}</p> : null}

          <div className="status-layout">
            <div className="status-block">
              <h3>Sessao</h3>
              <dl className="definition-list compact">
                <div>
                  <dt>Nome</dt>
                  <dd>{whatsAppStatus?.sessionName || 'Carregando...'}</dd>
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
                  <dt>Conta</dt>
                  <dd>{whatsAppStatus?.account?.pushname || 'Nao autenticada'}</dd>
                </div>
                <div>
                  <dt>Identificador</dt>
                  <dd>{whatsAppStatus?.account?.wid || 'Nao autenticado'}</dd>
                </div>
                <div>
                  <dt>Auto connect</dt>
                  <dd>{backendStatus?.whatsapp?.autoConnectEnabled ? 'Ativo' : 'Inativo'}</dd>
                </div>
                <div>
                  <dt>Sessao salva</dt>
                  <dd>
                    {backendStatus?.whatsapp?.hasSavedSession ? 'Detectada' : 'Nao detectada'}
                  </dd>
                </div>
              </dl>

              {whatsAppStatus?.lastError ? (
                <p className="inline-error">{whatsAppStatus.lastError}</p>
              ) : null}

              <div className="form-actions">
                <button
                  className="primary-button"
                  disabled={
                    isConnecting ||
                    isRecoveringRuntime ||
                    whatsAppStatus?.connection === 'starting' ||
                    whatsAppStatus?.connection === 'recovering'
                  }
                  onClick={handleConnectWhatsApp}
                  type="button"
                >
                  {isConnecting ? 'Iniciando sessao...' : 'Iniciar sessao do WhatsApp'}
                </button>
                <button
                  className="ghost-button"
                  disabled={!canRecoverWhatsAppSession || isRecoveringRuntime || isConnecting}
                  onClick={handleResetWhatsAppRuntime}
                  type="button"
                >
                  {isRecoveringRuntime ? 'Recuperando...' : 'Recuperar sessao local'}
                </button>
              </div>
            </div>

            <div className="status-block qr-block">
              <h3>QR code</h3>
              {whatsAppStatus?.qrCodeDataUrl ? (
                <img
                  alt="QR code do WhatsApp"
                  className="qr-image"
                  src={whatsAppStatus.qrCodeDataUrl}
                />
              ) : (
                <p className="empty-state compact-text">
                  O QR aparece aqui quando a sessao entrar em modo de pareamento.
                </p>
              )}
            </div>
          </div>
        </article>

        <article className="card wide-card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Enquete automatica</p>
              <h2>Criar e acompanhar enquete ativa</h2>
            </div>
            <button
              className="ghost-button"
              disabled={isClosingPoll || !activePoll}
              onClick={handleClosePoll}
              type="button"
            >
              {isClosingPoll ? 'Encerrando...' : 'Encerrar enquete'}
            </button>
          </div>

          {pollError ? <p className="inline-error">{pollError}</p> : null}

          <div className="status-layout">
            <div className="status-block">
              <h3>Nova enquete</h3>
              <form className="message-form poll-form" onSubmit={handleCreatePoll}>
                <label className="field field-full">
                  <span>Titulo</span>
                  <input
                    type="text"
                    value={pollForm.title}
                    onChange={(event) => setPollForm({ ...pollForm, title: event.target.value })}
                    placeholder="Ex.: Qual abertura voce prefere?"
                  />
                </label>

                <label className="field">
                  <span>Opcao 1</span>
                  <input
                    type="text"
                    value={pollForm.optionA}
                    onChange={(event) => setPollForm({ ...pollForm, optionA: event.target.value })}
                    placeholder="Ex.: Vinheta A"
                  />
                </label>

                <label className="field">
                  <span>Opcao 2</span>
                  <input
                    type="text"
                    value={pollForm.optionB}
                    onChange={(event) => setPollForm({ ...pollForm, optionB: event.target.value })}
                    placeholder="Ex.: Vinheta B"
                  />
                </label>

                <div className="form-actions">
                  <button className="primary-button" disabled={isCreatingPoll} type="submit">
                    {isCreatingPoll ? 'Criando...' : 'Criar enquete'}
                  </button>
                </div>
              </form>
            </div>

            <div className="status-block">
              <h3>Enquete ativa</h3>
              {activePoll ? (
                <div className="poll-details">
                  <p className="poll-title">{activePoll.title}</p>
                  <p className="poll-meta">
                    {activePoll.totalVoters} votante(s) unicos. Ultimo voto de cada numero vale.
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
                <p className="empty-state compact-text">
                  Nenhuma enquete ativa. Ao criar uma enquete, votos por texto recebido no WhatsApp
                  passam a ser apurados automaticamente.
                </p>
              )}
            </div>
          </div>
        </article>

        <article className="card wide-card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Entrada local de apoio</p>
              <h2>Adicionar mensagem manual de teste</h2>
            </div>
          </div>

          <form className="message-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Autor</span>
              <input
                type="text"
                value={formState.author}
                onChange={(event) => setFormState({ ...formState, author: event.target.value })}
                placeholder="Ex.: Maria Souza"
              />
            </label>

            <label className="field">
              <span>Telefone</span>
              <input
                type="text"
                value={formState.phone}
                onChange={(event) => setFormState({ ...formState, phone: event.target.value })}
                placeholder="Ex.: 11999990000"
              />
            </label>

            <label className="field field-full">
              <span>Mensagem</span>
              <textarea
                value={formState.content}
                onChange={(event) => setFormState({ ...formState, content: event.target.value })}
                placeholder="Use este formulario apenas para testes locais do fluxo."
                rows={4}
              />
            </label>

            {submissionError ? <p className="inline-error">{submissionError}</p> : null}

            <div className="form-actions">
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Adicionando...' : 'Adicionar a fila'}
              </button>
            </div>
          </form>
        </article>

        <article className="card wide-card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Fila de moderacao</p>
              <h2>Mensagens recebidas</h2>
            </div>
          </div>

          {actionError ? <p className="inline-error">{actionError}</p> : null}

          {queue.length ? (
            <div className="queue-list">
              {queue.map((item) => (
                <article className="queue-item" key={item.id}>
                  <div className="queue-item-header">
                    <div>
                      <h3>{item.author}</h3>
                      <p>{item.phone}</p>
                    </div>
                    <span className={`mini-status mini-status-${item.status}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>

                  {item.type === 'image' && item.media?.publicPath ? (
                    <img
                      alt={`Imagem enviada por ${item.author}`}
                      className="queue-image"
                      src={resolveMediaUrl(backendBaseUrl, item.media.publicPath)}
                    />
                  ) : null}

                  {item.type === 'audio' && item.media?.publicPath ? (
                    <audio
                      className="queue-audio"
                      controls
                      preload="metadata"
                      src={resolveMediaUrl(backendBaseUrl, item.media.publicPath)}
                    >
                      Seu navegador nao conseguiu carregar este audio.
                    </audio>
                  ) : null}

                  {item.type === 'video' && item.media?.publicPath ? (
                    <video
                      className="queue-video"
                      controls
                      preload="metadata"
                      src={resolveMediaUrl(backendBaseUrl, item.media.publicPath)}
                    >
                      Seu navegador nao conseguiu carregar este video.
                    </video>
                  ) : null}

                  {item.content ? <p className="queue-message">{item.content}</p> : null}

                  <div className="queue-meta">
                    <span>{formatTimestamp(item.receivedAt)}</span>
                    <span>{item.source}</span>
                    <span>{item.id}</span>
                  </div>

                  {item.pollVote ? (
                    <p className="vote-match">
                      Voto reconhecido: {item.pollVote.optionLabel}
                      {item.pollVote.wasReplacement ? ' (substituiu voto anterior)' : ''}
                    </p>
                  ) : null}

                  <div className="item-actions">
                    <button
                      className="ghost-button"
                      disabled={isActing || item.status === 'approved' || item.status === 'on_air'}
                      onClick={() => runItemAction(() => window.api.backend.approveItem(item.id))}
                      type="button"
                    >
                      Aprovar
                    </button>
                    <button
                      className="ghost-button ghost-button-danger"
                      disabled={isActing || item.status === 'rejected'}
                      onClick={() => runItemAction(() => window.api.backend.rejectItem(item.id))}
                      type="button"
                    >
                      Rejeitar
                    </button>
                    <button
                      className="primary-button"
                      disabled={isActing || item.status === 'rejected'}
                      onClick={() => runItemAction(() => window.api.backend.setLiveItem(item.id))}
                      type="button"
                    >
                      Colocar no ar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              Nenhuma mensagem na fila. Inicie a sessao do WhatsApp ou use a entrada manual para
              validar o fluxo.
            </p>
          )}
        </article>

        <article className="card wide-card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Live slot</p>
              <h2>Item principal no ar</h2>
            </div>

            <button
              className="ghost-button"
              disabled={isActing || !liveItem}
              onClick={() => runItemAction(() => window.api.backend.clearLiveItem())}
              type="button"
            >
              Limpar slot
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
                  className="queue-image"
                  src={resolveMediaUrl(backendBaseUrl, liveItem.media.publicPath)}
                />
              ) : null}
              {liveItem.type === 'audio' && liveItem.media?.publicPath ? (
                <audio
                  autoPlay
                  className="queue-audio"
                  controls
                  preload="metadata"
                  src={resolveMediaUrl(backendBaseUrl, liveItem.media.publicPath)}
                >
                  Seu navegador nao conseguiu carregar este audio.
                </audio>
              ) : null}
              {liveItem.type === 'video' && liveItem.media?.publicPath ? (
                <video
                  autoPlay
                  className="queue-video"
                  controls
                  preload="metadata"
                  src={resolveMediaUrl(backendBaseUrl, liveItem.media.publicPath)}
                >
                  Seu navegador nao conseguiu carregar este video.
                </video>
              ) : null}
              {liveItem.content ? <p className="queue-message">{liveItem.content}</p> : null}
              <div className="queue-meta">
                <span>{formatTimestamp(liveItem.receivedAt)}</span>
                <span>{liveItem.source}</span>
                <span>{liveItem.id}</span>
              </div>
            </article>
          ) : (
            <p className="empty-state">
              Nenhum item esta no ar. Aproxime o fluxo real aprovando uma mensagem e usando `Colocar
              no ar`.
            </p>
          )}
        </article>
      </section>
    </main>
  )
}

export default App
