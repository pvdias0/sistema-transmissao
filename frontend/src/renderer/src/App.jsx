import { useEffect, useState } from 'react'

const REFRESH_INTERVAL_MS = 4000
const MEDIA_TRANSPORT_REFRESH_INTERVAL_MS = 250
const BLOCKED_WORDS_STORAGE_KEY = 'sistema-transmissao.blocked-words.v1'
const THEME_STORAGE_KEY = 'sistema-transmissao.theme.v1'

const INITIAL_FORM = {
  author: '',
  phone: '',
  content: ''
}

const DEFAULT_POLL_OPTION_COLORS = ['#16a34a', '#dc2626', '#2563eb', '#d97706', '#7c3aed']

function createPollOptionDraft(index) {
  return {
    label: '',
    color: DEFAULT_POLL_OPTION_COLORS[index] || '#8ef2cf',
    aliasesText: ''
  }
}

const INITIAL_POLL_FORM = {
  title: '',
  options: [createPollOptionDraft(0), createPollOptionDraft(1)]
}

const OVERLAY_FONT_OPTIONS = ['Segoe UI', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia']

function formatBooleanLabel(value) {
  return value ? 'Ativo' : 'Inativo'
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }

    reader.onerror = () => {
      reject(new Error('Não foi possivel ler a imagem selecionada.'))
    }

    reader.readAsDataURL(file)
  })
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

function formatByteSize(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${Math.round(value)} B`
}

function resolveMediaUrl(baseUrl, publicPath) {
  if (!baseUrl || !publicPath) {
    return ''
  }

  return new URL(publicPath, `${baseUrl}/`).toString()
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function parseOptionAliasesInput(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((alias) => alias.trim())
    .filter(Boolean)
}

function parseBlockedWords(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function itemMatchesSearch(item, searchTerm) {
  const normalizedSearch = normalizeSearchText(searchTerm)

  if (!normalizedSearch) {
    return true
  }

  const searchableText = [
    item.author,
    item.phone,
    item.content,
    item.source,
    item.pollVote?.optionLabel
  ]
    .filter(Boolean)
    .join(' ')

  return normalizeSearchText(searchableText).includes(normalizedSearch)
}

function getBlockedWordMatches(item, blockedWords) {
  const normalizedContent = normalizeSearchText(item?.content || '')

  if (!normalizedContent || !blockedWords.length) {
    return []
  }

  return blockedWords.filter((word, index) => {
    const normalizedWord = normalizeSearchText(word)

    if (!normalizedWord) {
      return false
    }

    return (
      blockedWords.findIndex((candidate) => normalizeSearchText(candidate) === normalizedWord) ===
        index && normalizedContent.includes(normalizedWord)
    )
  })
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
  if (type === 'audio') return 'Áudio'
  if (type === 'video') return 'Vídeo'
  return 'Item'
}

function matchesTypeFilter(item, typeFilter) {
  if (!typeFilter || typeFilter === 'all') {
    return true
  }

  return item?.type === typeFilter
}

function getTransportStatusLabel(status) {
  if (status === 'cued') return 'Pronto'
  if (status === 'playing') return 'Tocando'
  if (status === 'paused') return 'Pausado'
  if (status === 'stopped') return 'Parado'
  if (status === 'ended') return 'Finalizado'
  if (status === 'error') return 'Erro'
  return status || 'Indisponível'
}

function getPreviewGuidance(status) {
  if (status === 'approved') {
    return 'Este item já foi aprovado. Se fizer sentido, coloque no ar quando quiser.'
  }

  if (status === 'on_air') {
    return 'Este item já esta no ar agora.'
  }

  if (status === 'rejected') {
    return 'Este item foi rejeitado e não volta para a transmissão.'
  }

  return 'Revise com calma e escolha a ação logo abaixo.'
}

function getWhatsAppConnectionLabel(status) {
  if (status === 'idle') return 'Não iniciado'
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

function getAppUpdateStatusLabel(status) {
  if (status === 'idle') return 'Pronto para verificar'
  if (status === 'checking') return 'Verificando atualizações'
  if (status === 'available') return 'Atualização disponível'
  if (status === 'up_to_date') return 'Você já está na versão mais recente'
  if (status === 'downloading') return 'Baixando atualização'
  if (status === 'downloaded') return 'Atualização pronta para instalar'
  if (status === 'installing') return 'Instalando atualização'
  if (status === 'error') return 'Falha na atualização'
  if (status === 'unavailable') return 'Indisponível neste ambiente'
  return 'Indisponível'
}

function getLicenseStatusLabel(licenseState) {
  if (!licenseState) return 'Carregando licença'
  if (licenseState.status === 'active') return 'Licença ativa'
  if (licenseState.status === 'offline_cache') return 'Ativo com cache local'
  if (licenseState.status === 'unconfigured') return 'Servidor não configurado'
  return 'Licença necessária'
}

function getLicenseStatusClass(licenseState) {
  if (licenseState?.status === 'active') return 'ok'
  if (licenseState?.status === 'offline_cache') return 'pending'
  if (licenseState?.status === 'unconfigured') return 'pending'
  return 'offline'
}

function formatLicenseKeyInput(value) {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  if (!normalized) {
    return ''
  }

  let body = normalized

  if (body.startsWith('PULSO')) {
    body = body.slice(5)
  }

  const parts = body.match(/.{1,6}/g) || []
  const formattedBody = parts.slice(0, 4).join('-')

  return formattedBody ? `PULSO-${formattedBody}` : 'PULSO-'
}

function App() {
  const [isAppReady, setIsAppReady] = useState(false)
  const [shellInfo, setShellInfo] = useState(null)
  const [appUpdateState, setAppUpdateState] = useState(null)
  const [licenseState, setLicenseState] = useState(null)
  const [config, setConfig] = useState(null)
  const [backendHealth, setBackendHealth] = useState({
    ok: false,
    error: 'Backend ainda não consultado',
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
  const [appUpdateError, setAppUpdateError] = useState('')
  const [licenseError, setLicenseError] = useState('')
  const [licenseKeyInput, setLicenseKeyInput] = useState('')
  const [formState, setFormState] = useState(INITIAL_FORM)
  const [pollForm, setPollForm] = useState(INITIAL_POLL_FORM)
  const [receivedSearch, setReceivedSearch] = useState('')
  const [approvedSearch, setApprovedSearch] = useState('')
  const [receivedTypeFilter, setReceivedTypeFilter] = useState('all')
  const [approvedTypeFilter, setApprovedTypeFilter] = useState('all')
  const [fontOverrideForm, setFontOverrideForm] = useState({})
  const [overlayAppearanceDrafts, setOverlayAppearanceDrafts] = useState({})
  const [activeTab, setActiveTab] = useState('operation')
  const [theme, setTheme] = useState('dark')
  const [activeOverlaySection, setActiveOverlaySection] = useState('canvas')
  const [activeVmixUrlTab, setActiveVmixUrlTab] = useState('local')
  const [activeSystemTransmissionTab, setActiveSystemTransmissionTab] = useState('local')
  const [previewItemId, setPreviewItemId] = useState(null)
  const [copiedUrlValue, setCopiedUrlValue] = useState('')
  const [isOperationSettingsOpen, setIsOperationSettingsOpen] = useState(false)
  const [activeOperationSettingsSection, setActiveOperationSettingsSection] =
    useState('blocked_words')
  const [blockedWordsText, setBlockedWordsText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isActing, setIsActing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecoveringRuntime, setIsRecoveringRuntime] = useState(false)
  const [isDisconnectingWhatsApp, setIsDisconnectingWhatsApp] = useState(false)
  const [isCreatingPoll, setIsCreatingPoll] = useState(false)
  const [isClosingPoll, setIsClosingPoll] = useState(false)
  const [isCleaningRuntime, setIsCleaningRuntime] = useState(false)
  const [isUpdatingOverlaySettings, setIsUpdatingOverlaySettings] = useState(false)
  const [isSendingMediaCommand, setIsSendingMediaCommand] = useState(false)
  const [isEnablingNetworkAccess, setIsEnablingNetworkAccess] = useState(false)
  const [isActivatingLicense, setIsActivatingLicense] = useState(false)
  const [isValidatingLicense, setIsValidatingLicense] = useState(false)
  const [isDeactivatingLicense, setIsDeactivatingLicense] = useState(false)

  useEffect(() => {
    let intervalId
    let active = true

    async function refreshAll() {
      const licenseResult = await window.api.license.getStatus()

      if (!active) {
        return
      }

      const nextLicenseState = licenseResult.ok ? licenseResult.data : null
      setLicenseState(nextLicenseState)

      if (!nextLicenseState?.accessAllowed) {
        setBackendStatus(null)
        setModerationState(null)
        setWhatsAppStatus(null)
        return
      }

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
    }

    async function bootstrap() {
      const [nextShellInfo, nextConfig] = await Promise.all([
        window.api.system.getShellInfo(),
        window.api.system.getConfig()
      ])
      const nextAppUpdateState = await window.api.appUpdate.getState()

      if (!active) {
        return
      }

      setShellInfo(nextShellInfo)
      setConfig(nextConfig)
      setAppUpdateState(nextAppUpdateState.ok ? nextAppUpdateState.data : null)

      await refreshAll()
      setIsAppReady(true)
      intervalId = window.setInterval(refreshAll, REFRESH_INTERVAL_MS)
    }

    const unsubscribeAppUpdate = window.api.appUpdate.onStateChange((nextState) => {
      if (!active) {
        return
      }

      setAppUpdateState(nextState)

      if (nextState?.status !== 'error') {
        setAppUpdateError('')
      }
    })

    bootstrap()

    return () => {
      active = false
      unsubscribeAppUpdate()

      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [])

  useEffect(() => {
    if (!isAppReady) {
      return undefined
    }

    const splashElement = document.getElementById('app-loading-screen')

    if (!splashElement) {
      return undefined
    }

    splashElement.classList.add('is-hidden')

    const timeoutId = window.setTimeout(() => {
      splashElement.remove()
    }, 320)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isAppReady])

  useEffect(() => {
    const liveTransport = moderationState?.mediaTransport

    if (!liveTransport?.itemId) {
      return undefined
    }

    let intervalId
    let active = true

    async function refreshMediaTransportState() {
      const moderationResult = await window.api.backend.getModerationState()

      if (!active || !moderationResult.ok) {
        return
      }

      setModerationState(moderationResult.data)
    }

    void refreshMediaTransportState()
    intervalId = window.setInterval(refreshMediaTransportState, MEDIA_TRANSPORT_REFRESH_INTERVAL_MS)

    return () => {
      active = false

      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [moderationState?.mediaTransport?.itemId, moderationState?.mediaTransport?.status])

  useEffect(() => {
    try {
      const savedBlockedWords = window.localStorage.getItem(BLOCKED_WORDS_STORAGE_KEY)

      if (savedBlockedWords !== null) {
        setBlockedWordsText(savedBlockedWords)
      }
    } catch (_error) {
      // Ignora falhas de persistencia local no renderer.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(BLOCKED_WORDS_STORAGE_KEY, blockedWordsText)
    } catch (_error) {
      // Ignora falhas de persistencia local no renderer.
    }
  }, [blockedWordsText])

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

      if (savedTheme === 'light' || savedTheme === 'dark') {
        setTheme(savedTheme)
      }
    } catch (_error) {
      // Ignora falhas de persistencia local no renderer.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch (_error) {
      // Ignora falhas de persistencia local no renderer.
    }

    document.body.dataset.theme = theme
    document.documentElement.dataset.theme = theme

    return () => {
      delete document.body.dataset.theme
      delete document.documentElement.dataset.theme
    }
  }, [theme])

  async function refreshOperationalState() {
    const nextLicenseState = await refreshLicenseState()

    if (!nextLicenseState?.accessAllowed) {
      setBackendStatus(null)
      setModerationState(null)
      setWhatsAppStatus(null)
      return
    }

    const [statusResult, moderationResult, whatsappResult] = await Promise.all([
      window.api.backend.getStatus(),
      window.api.backend.getModerationState(),
      window.api.whatsapp.getStatus()
    ])

    setBackendStatus(statusResult.ok ? statusResult.data : null)
    setModerationState(moderationResult.ok ? moderationResult.data : null)
    setWhatsAppStatus(whatsappResult.ok ? whatsappResult.data : null)
  }

  async function refreshLicenseState() {
    const result = await window.api.license.getStatus()
    const nextState = result.ok ? result.data : null

    setLicenseState(nextState)

    return nextState
  }

  async function handleActivateLicense(event) {
    event.preventDefault()
    setLicenseError('')
    setIsActivatingLicense(true)

    const result = await window.api.license.activate({
      licenseKey: licenseKeyInput
    })

    setIsActivatingLicense(false)

    if (!result.ok) {
      setLicenseError(result.error)
      return
    }

    setLicenseKeyInput('')
    setLicenseState(result.data)
    await refreshOperationalState()
  }

  async function handleValidateLicense() {
    setLicenseError('')
    setIsValidatingLicense(true)

    const result = await window.api.license.validate()

    setIsValidatingLicense(false)

    if (!result.ok) {
      setLicenseError(result.error)
      return
    }

    setLicenseState(result.data)
    await refreshOperationalState()
  }

  async function handleDeactivateLicense() {
    setLicenseError('')
    setIsDeactivatingLicense(true)

    const result = await window.api.license.deactivate()

    setIsDeactivatingLicense(false)

    if (!result.ok) {
      setLicenseError(result.error)
      return
    }

    setLicenseState(result.data)
    setBackendStatus(null)
    setModerationState(null)
    setWhatsAppStatus(null)
  }

  async function handleSetLiveItem(itemId) {
    const targetItem = (moderationState?.moderationQueue || []).find((item) => item.id === itemId)
    const blockedMatches = getBlockedWordMatches(targetItem, parseBlockedWords(blockedWordsText))

    if (blockedMatches.length) {
      setActionError(
        `Este item não pode ir ao ar porque contem termo(s) bloqueado(s): ${blockedMatches.join(', ')}.`
      )
      setPreviewItemId(itemId)
      return
    }

    await runItemAction(() => window.api.backend.setLiveItem(itemId))
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

  async function handleLogoutWhatsApp() {
    setWhatsAppError('')
    setIsDisconnectingWhatsApp(true)

    const result = await window.api.whatsapp.logout()

    setIsDisconnectingWhatsApp(false)

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
      options: pollForm.options.map((option) => ({
        label: option.label,
        color: option.color,
        aliases: parseOptionAliasesInput(option.aliasesText)
      }))
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

  async function handleDisableNetworkAccess() {
    setNetworkAccessError('')
    setNetworkAccessSuccess('')
    setIsEnablingNetworkAccess(true)

    const port = backendStatus?.transport?.port
    const result = await window.api.system.disableNetworkAccess({ port })

    setIsEnablingNetworkAccess(false)

    if (!result?.ok) {
      setNetworkAccessError(result?.error || 'Falha ao retirar acesso da rede.')
      return
    }

    setNetworkAccessSuccess(
      result?.data?.restarted
        ? 'Acesso da rede removido. O backend voltou a ouvir apenas localmente.'
        : 'Acesso da rede removido.'
    )
    await refreshOperationalState()
  }

  async function handleCheckForUpdates() {
    setAppUpdateError('')
    const result = await window.api.appUpdate.check()

    if (!result.ok) {
      setAppUpdateError(result.error)
    }

    if (result.data) {
      setAppUpdateState(result.data)
    }
  }

  async function handleDownloadUpdate() {
    setAppUpdateError('')
    setAppUpdateState((currentState) =>
      currentState
        ? {
            ...currentState,
            status: 'downloading',
            error: null
          }
        : currentState
    )
    const result = await window.api.appUpdate.download()

    if (!result.ok) {
      setAppUpdateError(result.error)
    }

    if (result.data) {
      setAppUpdateState(result.data)
    }
  }

  async function handleInstallUpdate() {
    setAppUpdateError('')
    const result = await window.api.appUpdate.install()

    if (!result.ok) {
      setAppUpdateError(result.error)
    }

    if (result.data) {
      setAppUpdateState(result.data)
    }
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

  function isValidOverlayBoxDimension(value) {
    const parsedValue = Number.parseInt(value, 10)
    return Number.isInteger(parsedValue) && parsedValue >= 180 && parsedValue <= 1800
  }

  async function handleOverlayBoxDimensionInputChange(target, key, value) {
    handleOverlayAppearanceDraftChange(target, key, value)

    if (!isValidOverlayBoxDimension(value)) {
      return
    }

    await updateOverlaySettings(target, {
      [key]: Number.parseInt(value, 10)
    })
  }

  async function commitOverlayBoxDimension(target, key) {
    const rawValue =
      overlayAppearanceDrafts?.[target]?.[key] ??
      backendStatus?.overlaySettings?.[target]?.[key] ??
      ''
    const parsedValue = Number.parseInt(rawValue, 10)

    if (!Number.isInteger(parsedValue)) {
      setOverlaySettingsError('Informe um valor numerico valido para largura ou altura do card.')
      return
    }

    const didUpdate = await updateOverlaySettings(target, {
      [key]: parsedValue
    })

    if (!didUpdate) {
      return
    }

    setOverlayAppearanceDrafts((current) => ({
      ...current,
      [target]: {
        ...(current[target] || {}),
        [key]: String(parsedValue)
      }
    }))
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

  async function handleOverlayBackgroundFileSelected(target, event) {
    const input = event.target
    const file = input.files?.[0]

    if (!file) {
      return
    }

    setOverlaySettingsError('')

    if (!file.type.startsWith('image/')) {
      setOverlaySettingsError('Selecione um arquivo de imagem valido para o fundo.')
      input.value = ''
      return
    }

    if (file.size > 2_000_000) {
      setOverlaySettingsError('A imagem de fundo deve ter no maximo 2 MB.')
      input.value = ''
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const didUpdate = await updateOverlaySettings(target, {
        backgroundImageUrl: dataUrl
      })

      if (!didUpdate) {
        input.value = ''
        return
      }

      setOverlayAppearanceDrafts((current) => ({
        ...current,
        [target]: {
          ...(current[target] || {}),
          backgroundImageUrl: dataUrl
        }
      }))
    } catch (error) {
      setOverlaySettingsError(
        error instanceof Error ? error.message : 'Não foi possível carregar a imagem selecionada.'
      )
    } finally {
      input.value = ''
    }
  }

  async function copyToClipboard(value, feedbackKey = value) {
    if (!value) {
      return
    }

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
        setCopiedUrlValue(feedbackKey)
        window.setTimeout(() => {
          setCopiedUrlValue((current) => (current === feedbackKey ? '' : current))
        }, 1400)
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
      setCopiedUrlValue(feedbackKey)
      window.setTimeout(() => {
        setCopiedUrlValue((current) => (current === feedbackKey ? '' : current))
      }, 1400)
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
        optionIndex === index ? { ...option, label: value } : option
      )
    }))
  }

  function handlePollOptionFieldChange(index, key, value) {
    setPollForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [key]: value } : option
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
        options: [...current.options, createPollOptionDraft(current.options.length)]
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
  const blockedWords = parseBlockedWords(blockedWordsText)
  const receivedItems = queue.filter(
    (item) => item.status !== 'approved' && item.status !== 'on_air'
  )
  const approvedItems = queue.filter((item) => item.status === 'approved')
  const filteredReceivedItems = receivedItems.filter(
    (item) => itemMatchesSearch(item, receivedSearch) && matchesTypeFilter(item, receivedTypeFilter)
  )
  const filteredApprovedItems = approvedItems.filter(
    (item) => itemMatchesSearch(item, approvedSearch) && matchesTypeFilter(item, approvedTypeFilter)
  )
  const previewItem = queue.find((item) => item.id === previewItemId) || null
  const previewBlockedMatches = previewItem ? getBlockedWordMatches(previewItem, blockedWords) : []
  const isPreviewBlockedFromAir = previewBlockedMatches.length > 0
  const mediaTransport = moderationState?.mediaTransport
  const activePoll = moderationState?.activePoll
  const whatsappStatusClass = getWhatsAppStatusClass(whatsAppStatus?.connection)
  const backendBaseUrl = config?.backendBaseUrl || ''
  const canRecoverWhatsAppSession =
    whatsAppStatus?.connection === 'error' || whatsAppStatus?.connection === 'disconnected'
  const canLogoutWhatsApp =
    whatsAppStatus?.connection === 'ready' ||
    whatsAppStatus?.connection === 'authenticated' ||
    whatsAppStatus?.connection === 'qr_ready'
  const appUpdateStatusLabel = getAppUpdateStatusLabel(appUpdateState?.status)
  const isCheckingForUpdates = appUpdateState?.status === 'checking'
  const isDownloadingUpdate = appUpdateState?.status === 'downloading'
  const isUpdateReadyToInstall = appUpdateState?.status === 'downloaded'
  const isUpdateAvailable = appUpdateState?.status === 'available'
  const isUpdateUnavailable = appUpdateState?.supported === false
  const updateProgressPercent = Math.max(
    0,
    Math.min(100, Math.round(appUpdateState?.progressPercent || 0))
  )
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
  const recommendedNetworkAddress = backendStatus?.transport?.recommendedNetworkAddress || ''
  const networkCandidates = backendStatus?.transport?.networkCandidates || []
  const otherNetworkCandidates = networkCandidates.filter(
    (candidate) => candidate.address !== recommendedNetworkAddress
  )
  const isNetworkAccessEnabled = backendStatus?.transport?.host === '0.0.0.0'
  const summaryPendingCount = receivedItems.filter((item) => item.status === 'pending').length
  const isLicenseAccessAllowed = Boolean(licenseState?.accessAllowed)
  const licenseStatusLabel = getLicenseStatusLabel(licenseState)
  const licenseStatusClass = getLicenseStatusClass(licenseState)
  const hasStoredLicense = Boolean(licenseState?.license?.keyMasked)
  const licenseExpiryLabel = licenseState?.license?.expiresAt
    ? formatTimestamp(licenseState.license.expiresAt)
    : 'Sem expiração definida'
  const canSubmitLicenseActivation =
    !isActivatingLicense && licenseKeyInput.trim().replace(/-/g, '').length > 5

  function renderOperationQueuePanel({
    title,
    kicker,
    subtitle,
    items,
    enableQuickModeration,
    showControls,
    searchValue,
    onSearchChange,
    typeFilter,
    onTypeFilterChange,
    emptyMessage
  }) {
    return (
      <article
        className={`operator-panel operation-list-panel ${items.length ? '' : 'operation-list-panel-empty'}`}
      >
        <div className="operator-panel-header">
          <div>
            <p className="card-kicker">{kicker}</p>
            <h2>{title}</h2>
            <p className="panel-subtitle">{subtitle}</p>
          </div>
          <span className="mini-badge">{items.length} item(ns)</span>
        </div>

        {showControls ? (
          <div className="operator-queue-toolbar">
            <label className="queue-search-field">
              <span>Buscar nesta lista</span>
              <input
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Procure por nome, grupo, numero ou trecho da mensagem"
                type="text"
                value={searchValue}
              />
            </label>
            <label className="queue-type-filter-field">
              <span>Tipo</span>
              <select
                onChange={(event) => onTypeFilterChange(event.target.value)}
                value={typeFilter}
              >
                <option value="all">Todos</option>
                <option value="text">Texto</option>
                <option value="image">Imagem</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </label>
            {searchValue ? (
              <button className="ghost-button" onClick={() => onSearchChange('')} type="button">
                Limpar busca
              </button>
            ) : null}
          </div>
        ) : null}

        {items.length ? (
          <div className="operator-queue-scroll operator-queue-scroll-compact">
            <div className="operator-queue">
              {items.map((item) => {
                const isSelected = previewItemId === item.id
                const blockedMatches = getBlockedWordMatches(item, blockedWords)

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
                        <p className="operator-queue-snippet">
                          {item.content?.trim()
                            ? item.content
                            : `${getItemTypeLabel(item.type)} recebida sem texto adicional.`}
                        </p>
                        <div className="queue-meta">
                          <span>{formatTimestamp(item.receivedAt)}</span>
                        </div>
                        {item.pollVote ? (
                          <p className="vote-match">
                            Voto reconhecido em {item.pollVote.optionLabel}
                            {item.pollVote.wasReplacement ? ' e substituiu o anterior.' : '.'}
                          </p>
                        ) : null}
                        {blockedMatches.length ? (
                          <p className="inline-warning">
                            Filtro de palavras: {blockedMatches.join(', ')}
                          </p>
                        ) : null}
                        <div className="operator-queue-footer">
                          <span className="message-type-badge">{getItemTypeLabel(item.type)}</span>
                          {enableQuickModeration ? (
                            <div className="operator-queue-actions">
                              <div className="queue-quick-actions">
                                <button
                                  className="ghost-button ghost-button-compact queue-quick-action queue-quick-action-approve"
                                  disabled={
                                    isActing ||
                                    item.status === 'approved' ||
                                    item.status === 'on_air'
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void runItemAction(() =>
                                      window.api.backend.approveItem(item.id)
                                    )
                                  }}
                                  type="button"
                                >
                                  Aprovar
                                </button>
                                <button
                                  className="ghost-button ghost-button-compact queue-quick-action queue-quick-action-reject"
                                  disabled={isActing || item.status === 'rejected'}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void runItemAction(() => window.api.backend.rejectItem(item.id))
                                  }}
                                  type="button"
                                >
                                  Rejeitar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span />
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="empty-state">{emptyMessage}</p>
        )}
      </article>
    )
  }

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

  function renderCopyableUrl(value, feedbackKey) {
    const isCopied = copiedUrlValue === feedbackKey

    return (
      <div className="copy-inline-row">
        <span className="copy-inline-value">{value || 'Indisponível'}</span>
        <div className="copy-inline-actions">
          <button
            aria-label="Copiar URL"
            className={`copy-inline-button ${isCopied ? 'is-copied' : ''}`}
            disabled={!value}
            onClick={() => void copyToClipboard(value, feedbackKey)}
            title={isCopied ? 'Copiado' : 'Copiar URL'}
            type="button"
          >
            <span aria-hidden="true" className="copy-inline-icon" />
          </button>
          {isCopied ? <span className="copy-inline-feedback">Copiado</span> : null}
        </div>
      </div>
    )
  }

  function renderTransmissionUrlBlock(mode) {
    const isLocal = mode === 'local'
    const messageUrl = isLocal ? localOverlayMessageUrl : networkOverlayMessageUrl
    const pollUrl = isLocal ? localOverlayPollUrl : networkOverlayPollUrl
    const statusLabel = messageUrl || pollUrl ? 'Disponível' : 'Indisponível'

    return (
      <div className="status-block-stack">
        <dl className="definition-list compact">
          <div>
            <dt>Status da URL</dt>
            <dd>{statusLabel}</dd>
          </div>
          <div>
            <dt>Overlay de mensagens</dt>
            <dd>{renderCopyableUrl(messageUrl, `${mode}-message`)}</dd>
          </div>
          <div>
            <dt>Overlay de enquete</dt>
            <dd>{renderCopyableUrl(pollUrl, `${mode}-poll`)}</dd>
          </div>
          {isLocal ? (
            <div>
              <dt>Última checagem</dt>
              <dd>{formatLastCheck(backendHealth.lastCheckedAt)}</dd>
            </div>
          ) : null}
          {isLocal ? (
            <div>
              <dt>Sistema</dt>
              <dd>{backendHealth.ok ? 'Online' : backendHealth.error}</dd>
            </div>
          ) : null}
        </dl>

        {!isLocal ? (
          <div className="network-access-panel">
            <p className="network-access-note">
              {isNetworkAccessEnabled
                ? 'O acesso pela rede local está liberado. Se não quiser mais expor o overlay para outros dispositivos, retire o acesso.'
                : 'Para compartilhar o overlay na rede local, permita a conexão no firewall do Windows.'}
            </p>
            {recommendedNetworkAddress ? (
              <p className="network-access-note">
                IP recomendado para outros dispositivos:{' '}
                <strong>{recommendedNetworkAddress}</strong>
              </p>
            ) : null}
            <div className="network-access-actions">
              <button
                className="ghost-button"
                disabled={isEnablingNetworkAccess || !backendStatus?.transport?.port}
                onClick={() =>
                  void (isNetworkAccessEnabled
                    ? handleDisableNetworkAccess()
                    : handleEnableNetworkAccess())
                }
                type="button"
              >
                {isEnablingNetworkAccess
                  ? 'Atualizando acesso...'
                  : isNetworkAccessEnabled
                    ? 'Retirar acesso da rede'
                    : 'Permitir acesso na rede'}
              </button>
              {networkAccessSuccess ? <p className="vote-match">{networkAccessSuccess}</p> : null}
              {networkAccessError ? <p className="inline-error">{networkAccessError}</p> : null}
            </div>
            {otherNetworkCandidates.length ? (
              <details className="network-candidates-panel">
                <summary>Detalhes técnicos de rede</summary>
                <p className="network-access-note">
                  Outros IPs detectados nesta máquina:{' '}
                  {otherNetworkCandidates.map((candidate) => candidate.address).join(', ')}
                </p>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  function handleToggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <main className="app-shell operator-shell" data-theme={theme}>
      <section className="operator-tabs-top">
        {isLicenseAccessAllowed ? (
          <div className="operator-tabs">
            <button
              className={`operator-tab-button ${activeTab === 'operation' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('operation')}
              type="button"
            >
              Operação
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
          </div>
        ) : (
          <div />
        )}

        <div className="operator-tabs-meta">
          {isLicenseAccessAllowed ? (
            <button
              aria-label="Abrir configurações da operação"
              className="ghost-button icon-button operator-settings-trigger"
              disabled={!isLicenseAccessAllowed}
              onClick={() => setIsOperationSettingsOpen(true)}
              title="Configurações da operação"
              type="button"
            >
              {String.fromCharCode(9881)}
            </button>
          ) : null}
          <button
            aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            className="ghost-button icon-button operator-theme-trigger"
            onClick={handleToggleTheme}
            title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            type="button"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </section>

      {whatsAppError || actionError || overlaySettingsError || pollError ? (
        <section className="operator-alerts">
          {whatsAppError ? <p className="inline-error">{whatsAppError}</p> : null}
          {actionError ? <p className="inline-error">{actionError}</p> : null}
          {overlaySettingsError ? <p className="inline-error">{overlaySettingsError}</p> : null}
          {pollError ? <p className="inline-error">{pollError}</p> : null}
        </section>
      ) : null}

      {!isLicenseAccessAllowed ? (
        <section className="license-lock-screen">
          <article className="operator-panel license-lock-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Acesso</p>
                <h2>Ative o Pulso</h2>
                <p className="panel-subtitle">
                  Esta instalação fica travada até receber uma chave válida. Sem ativação, as
                  mensagens, o WhatsApp e a transmissão permanecem bloqueados.
                </p>
              </div>
              <span className={`status-pill status-pill-${licenseStatusClass}`}>
                {licenseStatusLabel}
              </span>
            </div>

            {licenseError ? <p className="inline-error">{licenseError}</p> : null}
            {licenseState?.error ? <p className="inline-error">{licenseState.error}</p> : null}

            <dl className="definition-list compact">
              <div>
                <dt>Dispositivo</dt>
                <dd>{licenseState?.deviceName || 'Carregando...'}</dd>
              </div>
              <div>
                <dt>Machine ID</dt>
                <dd>{licenseState?.machineId || 'Gerando...'}</dd>
              </div>
              <div>
                <dt>Licença atual</dt>
                <dd>{licenseState?.license?.keyMasked || 'Nenhuma ativação local'}</dd>
              </div>
              <div>
                <dt>Validade</dt>
                <dd>{hasStoredLicense ? licenseExpiryLabel : 'Sem licença validada'}</dd>
              </div>
              <div>
                <dt>Última validação online</dt>
                <dd>
                  {licenseState?.lastValidatedOnlineAt
                    ? formatTimestamp(licenseState.lastValidatedOnlineAt)
                    : 'Ainda não validada'}
                </dd>
              </div>
              <div>
                <dt>Cache local até</dt>
                <dd>
                  {licenseState?.offlineGraceExpiresAt
                    ? formatTimestamp(licenseState.offlineGraceExpiresAt)
                    : 'Sem cache disponível'}
                </dd>
              </div>
            </dl>

            <form className="license-activation-form" onSubmit={handleActivateLicense}>
              <label className="field field-full">
                <span>Chave de acesso</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setLicenseKeyInput(formatLicenseKeyInput(event.target.value))}
                  placeholder="Ex.: PULSO-AB12CD-EF34GH-IJ56KL-MN78OP"
                  type="text"
                  value={licenseKeyInput}
                />
              </label>
              <div className="status-block-actions">
                <button
                  className="primary-button"
                  disabled={!canSubmitLicenseActivation}
                  type="submit"
                >
                  {isActivatingLicense ? 'Ativando...' : 'Ativar neste dispositivo'}
                </button>
                {hasStoredLicense ? (
                  <button
                    className="ghost-button"
                    disabled={isValidatingLicense || isActivatingLicense || isDeactivatingLicense}
                    onClick={() => void handleValidateLicense()}
                    type="button"
                  >
                    {isValidatingLicense ? 'Validando...' : 'Validar novamente'}
                  </button>
                ) : null}
                {hasStoredLicense ? (
                  <button
                    className="ghost-button ghost-button-danger"
                    disabled={isDeactivatingLicense || isActivatingLicense || isValidatingLicense}
                    onClick={() => void handleDeactivateLicense()}
                    type="button"
                  >
                    {isDeactivatingLicense ? 'Desativando...' : 'Remover deste dispositivo'}
                  </button>
                ) : null}
              </div>
            </form>

            <p className="operation-config-note">
              A chave é validada online e depois fica em cache local por tempo limitado. Se a
              licença expirar ou for revogada, esta tela volta a bloquear o app.
            </p>
          </article>
        </section>
      ) : null}

      {isLicenseAccessAllowed && activeTab === 'operation' ? (
        <section className="operator-tab-panel-stack">
          <section className="operation-top-grid">
            <article className="operator-panel">
              <div className="operator-panel-header">
                <div>
                  <p className="card-kicker">Revisão</p>
                  <h2>Preview</h2>
                  <p className="panel-subtitle">
                    Revise texto, imagem, áudio ou vídeo antes de aprovar, rejeitar ou colocar no
                    ar.
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
                      Seu navegador não conseguiu carregar este áudio.
                    </audio>
                  ) : null}

                  {previewItem.type === 'video' && previewItem.media?.publicPath ? (
                    <video
                      className="queue-video queue-video-preview"
                      controls
                      preload="metadata"
                      src={resolveMediaUrl(backendBaseUrl, previewItem.media.publicPath)}
                    >
                      Seu navegador não conseguiu carregar este vídeo.
                    </video>
                  ) : null}

                  {previewItem.content ? (
                    <p className="queue-message">{previewItem.content}</p>
                  ) : null}

                  <div className="queue-meta">
                    <span>{formatTimestamp(previewItem.receivedAt)}</span>
                    <span>{getItemTypeLabel(previewItem.type)}</span>
                  </div>

                  <p className="preview-guidance">{getPreviewGuidance(previewItem.status)}</p>

                  {isPreviewBlockedFromAir ? (
                    <p className="inline-warning">
                      Este item não pode ir ao ar com o filtro atual porque contem:{' '}
                      {previewBlockedMatches.join(', ')}.
                    </p>
                  ) : null}

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
                      disabled={
                        isActing || previewItem.status === 'rejected' || isPreviewBlockedFromAir
                      }
                      onClick={() => void handleSetLiveItem(previewItem.id)}
                      type="button"
                    >
                      {isPreviewBlockedFromAir ? 'Bloqueado pelo filtro' : 'Colocar no ar'}
                    </button>
                  </div>
                </article>
              ) : (
                <p className="empty-state empty-state-top">
                  Escolha um item em <code>Mensagens recebidas</code> ou{' '}
                  <code>Mensagens aprovadas</code> para abrir o preview.
                </p>
              )}
            </article>

            <article className="operator-panel">
              <div className="operator-panel-header">
                <div>
                  <p className="card-kicker">Transmissão</p>
                  <h2>No ar</h2>
                  <p className="panel-subtitle">
                    O que está sendo exibido agora no overlay usado pelo vMix.
                  </p>
                </div>
                <div className="operator-panel-actions">
                  <button
                    className="ghost-button"
                    disabled={isActing || !liveItem}
                    onClick={() => runItemAction(() => window.api.backend.clearLiveItem())}
                    type="button"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              {liveItem ? (
                <article className="live-item">
                  <div className="live-item-header">
                    <div>
                      <h3>{liveItem.author}</h3>
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
                      Seu navegador não conseguiu carregar este vídeo.
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

                      {mediaTransportError ? (
                        <p className="inline-error">{mediaTransportError}</p>
                      ) : null}

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
                <p className="empty-state empty-state-top">
                  Nenhum item foi enviado para a transmissão ainda.
                </p>
              )}
            </article>
          </section>

          <section className="operation-lists-grid">
            {renderOperationQueuePanel({
              title: 'Mensagens recebidas',
              kicker: 'Entrada',
              subtitle:
                'Itens novos, pendentes ou rejeitados que ainda não fazem parte da fila de aprovadas.',
              items: filteredReceivedItems,
              enableQuickModeration: true,
              showControls: receivedItems.length > 0,
              searchValue: receivedSearch,
              onSearchChange: setReceivedSearch,
              typeFilter: receivedTypeFilter,
              onTypeFilterChange: setReceivedTypeFilter,
              emptyMessage: receivedItems.length
                ? 'Nenhum item recebido encontrado com esse termo.'
                : 'Nenhuma mensagem recebida nesta lista no momento.'
            })}

            {renderOperationQueuePanel({
              title: 'Mensagens aprovadas',
              kicker: 'Prontas',
              subtitle:
                'Itens já liberados pelo operador e prontos para voltar ao preview ou ir ao ar.',
              items: filteredApprovedItems,
              enableQuickModeration: false,
              showControls: approvedItems.length > 0,
              searchValue: approvedSearch,
              onSearchChange: setApprovedSearch,
              typeFilter: approvedTypeFilter,
              onTypeFilterChange: setApprovedTypeFilter,
              emptyMessage: approvedItems.length
                ? 'Nenhum item aprovado encontrado com esse termo.'
                : 'Nenhuma mensagem aprovada no momento.'
            })}
          </section>

          {false && isOperationSettingsOpen ? (
            <div
              className="operation-modal-backdrop"
              onClick={() => setIsOperationSettingsOpen(false)}
              role="presentation"
            >
              <section
                className="operation-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Configurações da operação"
              >
                <aside className="operation-modal-sidebar">
                  <p className="card-kicker">Configuração</p>
                  <button
                    className={`operation-modal-nav-button ${
                      activeOperationSettingsSection === 'blocked_words' ? 'is-active' : ''
                    }`}
                    onClick={() => setActiveOperationSettingsSection('blocked_words')}
                    type="button"
                  >
                    Filtro de palavras
                  </button>
                  <button
                    className={`operation-modal-nav-button ${
                      activeOperationSettingsSection === 'manual_input' ? 'is-active' : ''
                    }`}
                    onClick={() => setActiveOperationSettingsSection('manual_input')}
                    type="button"
                  >
                    Entrada manual
                  </button>
                </aside>

                <div className="operation-modal-content">
                  {activeOperationSettingsSection === 'blocked_words' ? (
                    <>
                      <div className="operator-panel-header">
                        <div>
                          <p className="card-kicker">Operação</p>
                          <h2>Filtro de palavras</h2>
                          <p className="panel-subtitle">
                            Itens com estas palavras continuam entrando no sistema, mas ficam
                            impedidos de ir ao ar.
                          </p>
                        </div>
                        <button
                          className="ghost-button"
                          onClick={() => setIsOperationSettingsOpen(false)}
                          type="button"
                        >
                          Fechar
                        </button>
                      </div>

                      <label className="field field-full">
                        <span>Palavras ou termos bloqueados</span>
                        <textarea
                          className="operation-filter-textarea"
                          onChange={(event) => setBlockedWordsText(event.target.value)}
                          placeholder={'Ex.: palavrão\ntermo sensível\nspoiler'}
                          rows="10"
                          value={blockedWordsText}
                        />
                      </label>

                      <p className="operation-config-note">
                        Separe por linha, vírgula ou ponto e vírgula. O bloqueio é salvo
                        automaticamente neste computador.
                      </p>

                      {blockedWords.length ? (
                        <div className="operation-filter-chip-list">
                          {blockedWords.map((word, index) => (
                            <span className="mini-badge" key={`${word}-${index}`}>
                              {word}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="empty-state">Nenhuma palavra bloqueada configurada ainda.</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="operator-panel-header">
                        <div>
                          <p className="card-kicker">Operação</p>
                          <h2>Entrada manual</h2>
                          <p className="panel-subtitle">
                            Use este atalho apenas para validar rapidamente o fluxo local do app.
                          </p>
                        </div>
                        <button
                          className="ghost-button"
                          onClick={() => setIsOperationSettingsOpen(false)}
                          type="button"
                        >
                          Fechar
                        </button>
                      </div>

                      <form className="message-form compact-form" onSubmit={handleSubmit}>
                        <label className="field">
                          <span>Autor</span>
                          <input
                            onChange={(event) =>
                              setFormState({ ...formState, author: event.target.value })
                            }
                            placeholder="Ex.: Maria Souza"
                            type="text"
                            value={formState.author}
                          />
                        </label>
                        <label className="field">
                          <span>Telefone</span>
                          <input
                            onChange={(event) =>
                              setFormState({ ...formState, phone: event.target.value })
                            }
                            placeholder="Ex.: 11999990000"
                            type="text"
                            value={formState.phone}
                          />
                        </label>
                        <label className="field field-full">
                          <span>Mensagem</span>
                          <textarea
                            onChange={(event) =>
                              setFormState({ ...formState, content: event.target.value })
                            }
                            placeholder="Use esta área apenas para validar o fluxo local."
                            rows={4}
                            value={formState.content}
                          />
                        </label>
                        {submissionError ? <p className="inline-error">{submissionError}</p> : null}
                        <div className="form-actions">
                          <button className="primary-button" disabled={isSubmitting} type="submit">
                            {isSubmitting ? 'Adicionando...' : 'Adicionar à fila'}
                          </button>
                        </div>
                      </form>
                    </>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </section>
      ) : null}

      {isLicenseAccessAllowed && activeTab === 'polls' ? (
        <section className="operator-tab-panel-stack">
          <article className="operator-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Enquete</p>
                <h2>Votação ao vivo</h2>
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
                    <article
                      className="poll-option"
                      key={option.id}
                      style={{
                        backgroundColor: option.color || '#8ef2cf',
                        color: '#ffffff'
                      }}
                    >
                      <div className="poll-option-header">
                        <strong>{option.label}</strong>
                        <span>{option.votes} voto(s)</span>
                      </div>
                      <p className="poll-aliases poll-aliases-on-color">
                        Aceita: {option.aliases.join(', ')}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <form className="message-form poll-form compact-form" onSubmit={handleCreatePoll}>
                <label className="field field-full">
                  <span>Título</span>
                  <input
                    onChange={(event) => setPollForm({ ...pollForm, title: event.target.value })}
                    placeholder="Ex.: Qual abertura voce prefere?"
                    type="text"
                    value={pollForm.title}
                  />
                </label>
                <div className="poll-options-builder field field-full">
                  <p className="poll-options-builder-note">
                    A própria opção já conta como voto. Use palavras-chave extras separadas por
                    vírgula para aceitar atalhos como "s", "ss" ou variações parecidas.
                  </p>
                  <div className="poll-options-builder-list">
                    {pollForm.options.map((option, index) => (
                      <div className="poll-option-editor" key={`poll-option-input-${index}`}>
                        <div className="poll-option-editor-fields">
                          <label className="field">
                            <span>Opção {index + 1}</span>
                            <input
                              onChange={(event) =>
                                handlePollOptionChange(index, event.target.value)
                              }
                              placeholder={`Ex.: Opção ${index + 1}`}
                              type="text"
                              value={option.label}
                            />
                          </label>

                          <label className="field field-color">
                            <span>Cor</span>
                            <input
                              onChange={(event) =>
                                handlePollOptionFieldChange(index, 'color', event.target.value)
                              }
                              type="color"
                              value={option.color}
                            />
                          </label>

                          <label className="field field-full">
                            <span>Palavras-chave extras</span>
                            <input
                              onChange={(event) =>
                                handlePollOptionFieldChange(
                                  index,
                                  'aliasesText',
                                  event.target.value
                                )
                              }
                              placeholder="Ex.: s, ss, simmm"
                              type="text"
                              value={option.aliasesText}
                            />
                          </label>
                        </div>
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
                      Adicionar opção
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

      {isLicenseAccessAllowed && activeTab === 'overlay' ? (
        <section className="operator-tab-panel-stack">
          <article className="operator-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Overlay</p>
                <h2>Personalização rápida</h2>
                <p className="panel-subtitle">
                  Ajuste fonte, cores e fundo das mensagens e enquetes sem editar código.
                </p>
              </div>
            </div>

            <div className="overlay-style-tabs">
              <button
                className={`operator-tab-button ${activeOverlaySection === 'canvas' ? 'is-active' : ''}`}
                onClick={() => setActiveOverlaySection('canvas')}
                type="button"
              >
                Fundo geral
              </button>
              <button
                className={`operator-tab-button ${activeOverlaySection === 'message' ? 'is-active' : ''}`}
                onClick={() => setActiveOverlaySection('message')}
                type="button"
              >
                Card da mensagem
              </button>
              <button
                className={`operator-tab-button ${activeOverlaySection === 'poll' ? 'is-active' : ''}`}
                onClick={() => setActiveOverlaySection('poll')}
                type="button"
              >
                Card da enquete
              </button>
            </div>

            <div className="overlay-style-grid">
              {activeOverlaySection === 'canvas' ? (
                <section className="overlay-style-card overlay-style-card-wide">
                  <div className="overlay-style-header">
                    <div>
                      <p className="card-kicker">Transmissão</p>
                      <h3>Fundo geral</h3>
                    </div>
                  </div>

                  <div className="overlay-style-fields">
                    <label className="field field-full">
                      <span>Fundo da transmissão</span>
                      <select
                        disabled={isUpdatingOverlaySettings}
                        onChange={(event) =>
                          void handleOverlayAppearanceChange(
                            'canvas',
                            'enabled',
                            event.target.value === 'enabled'
                          )
                        }
                        value={
                          getOverlayAppearanceValue('canvas', 'enabled') ? 'enabled' : 'transparent'
                        }
                      >
                        <option value="transparent">Transparente (padrão)</option>
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
                        placeholder="Cole uma URL de imagem. Deixe vazio para usar só a cor."
                        type="text"
                        value={getOverlayAppearanceValue('canvas', 'backgroundImageUrl')}
                      />
                    </label>
                  </div>

                  <div className="overlay-style-actions">
                    <input
                      accept="image/*"
                      className="visually-hidden-input"
                      id="canvas-background-image-upload"
                      onChange={(event) =>
                        void handleOverlayBackgroundFileSelected('canvas', event)
                      }
                      type="file"
                    />
                    <label
                      className="ghost-button file-upload-button"
                      htmlFor="canvas-background-image-upload"
                    >
                      Enviar imagem do fundo
                    </label>
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
              ) : null}

              {activeOverlaySection === 'message' ? (
                <section className="overlay-style-card overlay-style-card-wide">
                  <div className="overlay-style-header">
                    <div>
                      <p className="card-kicker">Mensagem</p>
                      <h3>Card da mensagem</h3>
                    </div>
                  </div>

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
                  </div>

                  <div className="overlay-style-fields">
                    <label className="field">
                      <span>Largura da caixa</span>
                      <input
                        disabled={isUpdatingOverlaySettings}
                        onBlur={() => void commitOverlayBoxDimension('message', 'boxWidth')}
                        onChange={(event) =>
                          void handleOverlayBoxDimensionInputChange(
                            'message',
                            'boxWidth',
                            event.target.value
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void commitOverlayBoxDimension('message', 'boxWidth')
                          }
                        }}
                        max="1800"
                        min="180"
                        step="10"
                        type="number"
                        value={getOverlayAppearanceValue('message', 'boxWidth')}
                      />
                    </label>

                    <label className="field">
                      <span>Altura da caixa</span>
                      <input
                        disabled={isUpdatingOverlaySettings}
                        onBlur={() => void commitOverlayBoxDimension('message', 'boxHeight')}
                        onChange={(event) =>
                          void handleOverlayBoxDimensionInputChange(
                            'message',
                            'boxHeight',
                            event.target.value
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void commitOverlayBoxDimension('message', 'boxHeight')
                          }
                        }}
                        max="1800"
                        min="180"
                        step="10"
                        type="number"
                        value={getOverlayAppearanceValue('message', 'boxHeight')}
                      />
                    </label>

                    <p className="network-access-note field-full">
                      Cada item novo no ar volta primeiro para o autoajuste do conteúdo. Os campos
                      de largura e altura passam a valer como ajuste manual apenas para o item
                      atual.
                    </p>

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
                        placeholder="Cole uma URL de imagem. Deixe vazio para usar só a cor."
                        type="text"
                        value={getOverlayAppearanceValue('message', 'backgroundImageUrl')}
                      />
                    </label>
                  </div>

                  <div className="overlay-style-actions">
                    <input
                      accept="image/*"
                      className="visually-hidden-input"
                      id="message-background-image-upload"
                      onChange={(event) =>
                        void handleOverlayBackgroundFileSelected('message', event)
                      }
                      type="file"
                    />
                    <label
                      className="ghost-button file-upload-button"
                      htmlFor="message-background-image-upload"
                    >
                      Enviar imagem da mensagem
                    </label>
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
              ) : null}

              {activeOverlaySection === 'poll' ? (
                <section className="overlay-style-card overlay-style-card-wide">
                  <div className="overlay-style-header">
                    <div>
                      <p className="card-kicker">Enquete</p>
                      <h3>Card da enquete</h3>
                    </div>
                  </div>

                  <div className="font-control-group">
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
                      <span>Largura da caixa</span>
                      <input
                        disabled={isUpdatingOverlaySettings}
                        onBlur={() => void commitOverlayBoxDimension('poll', 'boxWidth')}
                        onChange={(event) =>
                          void handleOverlayBoxDimensionInputChange(
                            'poll',
                            'boxWidth',
                            event.target.value
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void commitOverlayBoxDimension('poll', 'boxWidth')
                          }
                        }}
                        max="1800"
                        min="180"
                        step="10"
                        type="number"
                        value={getOverlayAppearanceValue('poll', 'boxWidth')}
                      />
                    </label>

                    <label className="field">
                      <span>Altura da caixa</span>
                      <input
                        disabled={isUpdatingOverlaySettings}
                        onBlur={() => void commitOverlayBoxDimension('poll', 'boxHeight')}
                        onChange={(event) =>
                          void handleOverlayBoxDimensionInputChange(
                            'poll',
                            'boxHeight',
                            event.target.value
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void commitOverlayBoxDimension('poll', 'boxHeight')
                          }
                        }}
                        max="1800"
                        min="180"
                        step="10"
                        type="number"
                        value={getOverlayAppearanceValue('poll', 'boxHeight')}
                      />
                    </label>

                    <p className="network-access-note field-full">
                      Quando uma enquete nova entrar no ar, a caixa também se ajusta primeiro ao
                      conteúdo antes de aceitar novos ajustes manuais.
                    </p>

                    <label className="field">
                      <span>Fonte</span>
                      <select
                        disabled={isUpdatingOverlaySettings}
                        onChange={(event) =>
                          void handleOverlayAppearanceChange(
                            'poll',
                            'fontFamily',
                            event.target.value
                          )
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
                          void handleOverlayAppearanceChange(
                            'poll',
                            'textColor',
                            event.target.value
                          )
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
                          void handleOverlayAppearanceChange(
                            'poll',
                            'accentColor',
                            event.target.value
                          )
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
                        placeholder="Cole uma URL de imagem. Deixe vazio para usar só a cor."
                        type="text"
                        value={getOverlayAppearanceValue('poll', 'backgroundImageUrl')}
                      />
                    </label>
                  </div>

                  <div className="overlay-style-actions">
                    <input
                      accept="image/*"
                      className="visually-hidden-input"
                      id="poll-background-image-upload"
                      onChange={(event) => void handleOverlayBackgroundFileSelected('poll', event)}
                      type="file"
                    />
                    <label
                      className="ghost-button file-upload-button"
                      htmlFor="poll-background-image-upload"
                    >
                      Enviar imagem da enquete
                    </label>
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
              ) : null}
            </div>
          </article>

          <article className="operator-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Saída</p>
                <h2>Uso no vMix</h2>
                <p className="panel-subtitle">
                  Use estas URLs no Browser Input e mantenha o ajuste visual centralizado aqui. Na
                  primeira execução, permita a conexão quando o Windows solicitar acesso à rede.
                </p>
              </div>
            </div>

            <div className="status-block-tabs-shell">
              <div className="status-block-tabs">
                <button
                  className={`status-block-tab ${activeVmixUrlTab === 'local' ? 'is-active' : ''}`}
                  onClick={() => setActiveVmixUrlTab('local')}
                  type="button"
                >
                  Local
                </button>
                <button
                  className={`status-block-tab ${activeVmixUrlTab === 'network' ? 'is-active' : ''}`}
                  onClick={() => setActiveVmixUrlTab('network')}
                  type="button"
                >
                  Rede
                </button>
              </div>
            </div>

            {renderTransmissionUrlBlock(activeVmixUrlTab === 'local' ? 'local' : 'network')}
          </article>
        </section>
      ) : null}

      {isLicenseAccessAllowed && activeTab === 'system' ? (
        <section className="operator-tab-panel-stack">
          <section className="operator-summary">
            <article className="summary-card">
              <span className="summary-label">Mensagens aguardando</span>
              <strong className="summary-value">{summaryPendingCount}</strong>
              <span className="summary-note">Itens que ainda precisam de decisão.</span>
            </article>
            <article className="summary-card">
              <span className="summary-label">Preview atual</span>
              <strong className="summary-value">
                {previewItem ? previewItem.author : 'Nenhum item'}
              </strong>
              <span className="summary-note">
                {previewItem
                  ? `${getItemTypeLabel(previewItem.type)} pronto para revisão`
                  : 'Escolha um item para revisar na operação.'}
              </span>
            </article>
            <article className="summary-card">
              <span className="summary-label">No ar</span>
              <strong className="summary-value">
                {liveItem ? liveItem.author : 'Nada ao vivo'}
              </strong>
              <span className="summary-note">
                {liveItem
                  ? `${getItemTypeLabel(liveItem.type)} exibido agora`
                  : 'Nenhum item enviado para a transmissão.'}
              </span>
            </article>
            <article className="summary-card">
              <span className="summary-label">Enquete</span>
              <strong className="summary-value">
                {activePoll ? activePoll.title : 'Sem enquete'}
              </strong>
              <span className="summary-note">
                {activePoll
                  ? `${activePoll.totalVoters} voto(s) únicos registrados`
                  : 'Crie uma enquete quando precisar abrir votação.'}
              </span>
            </article>
          </section>

          <article className="operator-panel">
            <div className="operator-panel-header">
              <div>
                <p className="card-kicker">Sistema</p>
                <h2>Manutenção e apoio</h2>
                <p className="panel-subtitle">
                  Recursos técnicos e operacionais menos frequentes, separados da rotina principal.
                </p>
              </div>
            </div>

            <div className="operator-details-grid operator-details-grid-open">
              <section className="status-block">
                <div className="status-block-header">
                  <h3>Licença</h3>
                  <span className={`status-pill status-pill-${licenseStatusClass}`}>
                    {licenseStatusLabel}
                  </span>
                </div>
                {licenseError ? <p className="inline-error">{licenseError}</p> : null}
                <dl className="definition-list compact">
                  <div>
                    <dt>Chave</dt>
                    <dd>{licenseState?.license?.keyMasked || 'Nenhuma ativação local'}</dd>
                  </div>
                  <div>
                    <dt>Plano</dt>
                    <dd>{licenseState?.license?.label || 'Sem identificação'}</dd>
                  </div>
                  <div>
                    <dt>Validade</dt>
                    <dd>{licenseExpiryLabel}</dd>
                  </div>
                  <div>
                    <dt>Última validação online</dt>
                    <dd>
                      {licenseState?.lastValidatedOnlineAt
                        ? formatTimestamp(licenseState.lastValidatedOnlineAt)
                        : 'Ainda não validada'}
                    </dd>
                  </div>
                  <div>
                    <dt>Cache local até</dt>
                    <dd>
                      {licenseState?.offlineGraceExpiresAt
                        ? formatTimestamp(licenseState.offlineGraceExpiresAt)
                        : 'Sem cache local'}
                    </dd>
                  </div>
                </dl>
                <div className="status-block-actions">
                  <button
                    className="ghost-button"
                    disabled={isValidatingLicense || isDeactivatingLicense}
                    onClick={() => void handleValidateLicense()}
                    type="button"
                  >
                    {isValidatingLicense ? 'Validando...' : 'Validar agora'}
                  </button>
                  <button
                    className="ghost-button ghost-button-danger"
                    disabled={isDeactivatingLicense || isValidatingLicense}
                    onClick={() => void handleDeactivateLicense()}
                    type="button"
                  >
                    {isDeactivatingLicense ? 'Desativando...' : 'Desativar neste dispositivo'}
                  </button>
                </div>
              </section>

              <section className="status-block status-block-whatsapp">
                <div className="status-block-header">
                  <h3>WhatsApp</h3>
                  <span className={`status-pill status-pill-${whatsappStatusClass}`}>
                    {getWhatsAppConnectionLabel(whatsAppStatus?.connection)}
                  </span>
                </div>
                <dl className="definition-list compact">
                  <div>
                    <dt>Conta</dt>
                    <dd>{whatsAppStatus?.account?.pushname || 'Não autenticada'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{getWhatsAppConnectionLabel(whatsAppStatus?.connection)}</dd>
                  </div>
                  <div>
                    <dt>Último evento</dt>
                    <dd>
                      {whatsAppStatus?.lastEventAt
                        ? formatTimestamp(whatsAppStatus.lastEventAt)
                        : 'Sem eventos'}
                    </dd>
                  </div>
                  <div>
                    <dt>QR code</dt>
                    <dd>{whatsAppStatus?.qrCodeDataUrl ? 'Disponível' : 'Não exibido'}</dd>
                  </div>
                </dl>
                <div className="status-block-actions">
                  {canLogoutWhatsApp ? (
                    <button
                      className="ghost-button ghost-button-danger"
                      disabled={isDisconnectingWhatsApp || isConnecting || isRecoveringRuntime}
                      onClick={handleLogoutWhatsApp}
                      type="button"
                    >
                      {isDisconnectingWhatsApp ? 'Desconectando...' : 'Desconectar'}
                    </button>
                  ) : null}
                  {!canLogoutWhatsApp ? (
                    <button
                      className="primary-button"
                      disabled={
                        isConnecting ||
                        isDisconnectingWhatsApp ||
                        isRecoveringRuntime ||
                        whatsAppStatus?.connection === 'starting' ||
                        whatsAppStatus?.connection === 'recovering'
                      }
                      onClick={handleConnectWhatsApp}
                      type="button"
                    >
                      {isConnecting ? 'Conectando...' : 'Conectar'}
                    </button>
                  ) : null}
                  {!canLogoutWhatsApp && canRecoverWhatsAppSession ? (
                    <button
                      className="ghost-button"
                      disabled={isRecoveringRuntime || isConnecting || isDisconnectingWhatsApp}
                      onClick={handleResetWhatsAppRuntime}
                      type="button"
                    >
                      {isRecoveringRuntime ? 'Recuperando...' : 'Recuperar'}
                    </button>
                  ) : null}
                </div>
                {whatsAppStatus?.lastError ? (
                  <p className="inline-error">{whatsAppStatus.lastError}</p>
                ) : null}
                {whatsAppStatus?.qrCodeDataUrl ? (
                  <img
                    alt="QR code do WhatsApp"
                    className="qr-image"
                    src={whatsAppStatus.qrCodeDataUrl}
                  />
                ) : null}
              </section>

              <section className="status-block">
                <div className="status-block-header">
                  <h3>Transmissão</h3>
                </div>
                <div className="status-block-tabs-shell">
                  <div className="status-block-tabs">
                    <button
                      className={`status-block-tab ${
                        activeSystemTransmissionTab === 'local' ? 'is-active' : ''
                      }`}
                      onClick={() => setActiveSystemTransmissionTab('local')}
                      type="button"
                    >
                      Local
                    </button>
                    <button
                      className={`status-block-tab ${
                        activeSystemTransmissionTab === 'network' ? 'is-active' : ''
                      }`}
                      onClick={() => setActiveSystemTransmissionTab('network')}
                      type="button"
                    >
                      Rede
                    </button>
                  </div>
                </div>
                {renderTransmissionUrlBlock(
                  activeSystemTransmissionTab === 'local' ? 'local' : 'network'
                )}
              </section>

              <section className="status-block">
                <div className="status-block-header">
                  <h3>Recuperação e limpeza</h3>
                </div>
                {cleanupError ? <p className="inline-error">{cleanupError}</p> : null}
                {cleanupSuccess ? <p className="vote-match">{cleanupSuccess}</p> : null}
                <dl className="definition-list compact">
                  <div>
                    <dt>Estado restaurado</dt>
                    <dd>{backendStatus?.runtime?.restoredFromDisk ? 'Sim' : 'Não'}</dd>
                  </div>
                  <div>
                    <dt>Última persistência</dt>
                    <dd>
                      {backendStatus?.runtime?.persistedAt
                        ? formatTimestamp(backendStatus.runtime.persistedAt)
                        : 'Sem persistência anterior'}
                    </dd>
                  </div>
                </dl>
                <div className="status-block-actions">
                  <button
                    className="ghost-button ghost-button-danger"
                    disabled={isCleaningRuntime}
                    onClick={handleCleanupRuntime}
                    type="button"
                  >
                    {isCleaningRuntime ? 'Limpando...' : 'Limpar dados locais'}
                  </button>
                </div>
              </section>

              <section className="status-block">
                <div className="status-block-header">
                  <h3>Aplicativo</h3>
                </div>
                {appUpdateError ? <p className="inline-error">{appUpdateError}</p> : null}
                <dl className="definition-list compact">
                  <div>
                    <dt>App</dt>
                    <dd>{shellInfo?.appName || 'Carregando...'}</dd>
                  </div>
                  <div>
                    <dt>Versão</dt>
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
                  <div>
                    <dt>Atualização</dt>
                    <dd>{appUpdateStatusLabel}</dd>
                  </div>
                  <div>
                    <dt>Versão disponível</dt>
                    <dd>{appUpdateState?.availableVersion || 'Nenhuma pendente'}</dd>
                  </div>
                  <div>
                    <dt>Última checagem</dt>
                    <dd>
                      {appUpdateState?.lastCheckedAt
                        ? formatTimestamp(appUpdateState.lastCheckedAt)
                        : 'Ainda não verificada'}
                    </dd>
                  </div>
                  <div>
                    <dt>Download</dt>
                    <dd>
                      {isDownloadingUpdate
                        ? `${Math.round(appUpdateState?.progressPercent || 0)}% (${formatByteSize(
                            appUpdateState?.transferredBytes || 0
                          )} / ${formatByteSize(appUpdateState?.totalBytes || 0)})`
                        : isUpdateReadyToInstall
                          ? 'Concluído'
                          : 'Aguardando'}
                    </dd>
                  </div>
                </dl>
                {appUpdateState?.error ? (
                  <p className="inline-error">{appUpdateState.error}</p>
                ) : null}
                {isDownloadingUpdate ? (
                  <div className="update-progress-block" aria-live="polite">
                    <div className="update-progress-header">
                      <strong>Download em andamento</strong>
                      <span>{updateProgressPercent}%</span>
                    </div>
                    <div
                      aria-valuemax="100"
                      aria-valuemin="0"
                      aria-valuenow={updateProgressPercent}
                      className="update-progress-bar"
                      role="progressbar"
                    >
                      <span
                        className="update-progress-bar-fill"
                        style={{ width: `${updateProgressPercent}%` }}
                      />
                    </div>
                    <p className="update-progress-note">
                      {formatByteSize(appUpdateState?.transferredBytes || 0)} de{' '}
                      {formatByteSize(appUpdateState?.totalBytes || 0)} baixados.
                    </p>
                  </div>
                ) : null}
                {isUpdateReadyToInstall ? (
                  <p className="update-progress-note">
                    A atualização foi baixada. Reinicie o app para concluir a instalação.
                  </p>
                ) : null}
                {isUpdateUnavailable ? (
                  <p className="network-access-note">
                    A atualização automática funciona apenas no aplicativo instalado.
                  </p>
                ) : null}
                <div className="status-block-actions">
                  <button
                    className="ghost-button"
                    disabled={isCheckingForUpdates || isDownloadingUpdate || isUpdateReadyToInstall}
                    onClick={handleCheckForUpdates}
                    type="button"
                  >
                    {isCheckingForUpdates ? 'Verificando...' : 'Verificar atualização'}
                  </button>
                  {isUpdateAvailable ? (
                    <button
                      className="primary-button"
                      disabled={isDownloadingUpdate}
                      onClick={handleDownloadUpdate}
                      type="button"
                    >
                      {isDownloadingUpdate ? 'Baixando...' : 'Baixar atualização'}
                    </button>
                  ) : null}
                  {isUpdateReadyToInstall ? (
                    <button className="primary-button" onClick={handleInstallUpdate} type="button">
                      Reiniciar e atualizar
                    </button>
                  ) : null}
                </div>
              </section>
            </div>
          </article>
        </section>
      ) : null}

      {isLicenseAccessAllowed && isOperationSettingsOpen ? (
        <div
          className="operation-modal-backdrop"
          onClick={() => setIsOperationSettingsOpen(false)}
          role="presentation"
        >
          <section
            className="operation-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Configurações da operação"
          >
            <aside className="operation-modal-sidebar">
              <p className="card-kicker">Configuração</p>
              <button
                className={`operation-modal-nav-button ${
                  activeOperationSettingsSection === 'blocked_words' ? 'is-active' : ''
                }`}
                onClick={() => setActiveOperationSettingsSection('blocked_words')}
                type="button"
              >
                Filtro de palavras
              </button>
              <button
                className={`operation-modal-nav-button ${
                  activeOperationSettingsSection === 'manual_input' ? 'is-active' : ''
                }`}
                onClick={() => setActiveOperationSettingsSection('manual_input')}
                type="button"
              >
                Entrada manual
              </button>
            </aside>

            <div className="operation-modal-content">
              {activeOperationSettingsSection === 'blocked_words' ? (
                <>
                  <div className="operator-panel-header">
                    <div>
                      <p className="card-kicker">Operação</p>
                      <h2>Filtro de palavras</h2>
                      <p className="panel-subtitle">
                        Itens com estas palavras continuam entrando no sistema, mas ficam impedidos
                        de ir ao ar.
                      </p>
                    </div>
                    <button
                      className="ghost-button"
                      onClick={() => setIsOperationSettingsOpen(false)}
                      type="button"
                    >
                      Fechar
                    </button>
                  </div>

                  <label className="field field-full">
                    <span>Palavras ou termos bloqueados</span>
                    <textarea
                      className="operation-filter-textarea"
                      onChange={(event) => setBlockedWordsText(event.target.value)}
                      placeholder={'Ex.: palavrão\ntermo sensível\nspoiler'}
                      rows="10"
                      value={blockedWordsText}
                    />
                  </label>

                  <p className="operation-config-note">
                    Separe por linha, vírgula ou ponto e vírgula. O bloqueio é salvo
                    automaticamente neste computador.
                  </p>

                  {blockedWords.length ? (
                    <div className="operation-filter-chip-list">
                      {blockedWords.map((word, index) => (
                        <span className="mini-badge" key={`${word}-${index}`}>
                          {word}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">Nenhuma palavra bloqueada configurada ainda.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="operator-panel-header">
                    <div>
                      <p className="card-kicker">Operação</p>
                      <h2>Entrada manual</h2>
                      <p className="panel-subtitle">
                        Use este atalho apenas para validar rapidamente o fluxo local do app.
                      </p>
                    </div>
                    <button
                      className="ghost-button"
                      onClick={() => setIsOperationSettingsOpen(false)}
                      type="button"
                    >
                      Fechar
                    </button>
                  </div>

                  <form className="message-form compact-form" onSubmit={handleSubmit}>
                    <label className="field">
                      <span>Autor</span>
                      <input
                        onChange={(event) =>
                          setFormState({ ...formState, author: event.target.value })
                        }
                        placeholder="Ex.: Maria Souza"
                        type="text"
                        value={formState.author}
                      />
                    </label>
                    <label className="field">
                      <span>Telefone</span>
                      <input
                        onChange={(event) =>
                          setFormState({ ...formState, phone: event.target.value })
                        }
                        placeholder="Ex.: 11999990000"
                        type="text"
                        value={formState.phone}
                      />
                    </label>
                    <label className="field field-full">
                      <span>Mensagem</span>
                      <textarea
                        onChange={(event) =>
                          setFormState({ ...formState, content: event.target.value })
                        }
                        placeholder="Use esta área apenas para validar o fluxo local."
                        rows={4}
                        value={formState.content}
                      />
                    </label>
                    {submissionError ? <p className="inline-error">{submissionError}</p> : null}
                    <div className="form-actions">
                      <button className="primary-button" disabled={isSubmitting} type="submit">
                        {isSubmitting ? 'Adicionando...' : 'Adicionar à fila'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
