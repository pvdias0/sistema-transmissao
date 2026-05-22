const RELEASE_BASE_URL = 'https://updates.pvapps.com.br'
const RELEASE_LATEST_URL = `${RELEASE_BASE_URL}/latest.yml`

const downloadLink = document.getElementById('download-link')
const downloadVersion = document.getElementById('download-version')
const downloadNote = document.getElementById('download-note')

function setReleaseFallback(message) {
  downloadVersion.textContent = 'Release manual'
  downloadNote.textContent = message
}

function parseLatestReleaseYml(rawText) {
  const versionMatch = rawText.match(/^version:\s*"?([^\r\n"]+)"?/m)
  const pathMatch = rawText.match(/^\s*path:\s*"?([^\r\n"]+)"?/m)

  return {
    version: versionMatch?.[1]?.trim() || null,
    path: pathMatch?.[1]?.trim() || null
  }
}

async function hydrateReleaseLink() {
  try {
    const response = await fetch(RELEASE_LATEST_URL, {
      cache: 'no-store'
    })

    if (!response.ok) {
      setReleaseFallback('Instalador disponível nesta página assim que a release for publicada.')
      return
    }

    const rawText = await response.text()
    const release = parseLatestReleaseYml(rawText)

    if (release.path) {
      downloadLink.href = `${RELEASE_BASE_URL}/${release.path}`
    }

    if (release.version) {
      downloadVersion.textContent = `v${release.version}`
      downloadNote.textContent =
        'Clique no botão para baixar a última versão disponível.'
      return
    }

    setReleaseFallback('Release detectada, mas sem versão legível no arquivo latest.yml.')
  } catch {
    setReleaseFallback(
      'Não foi possível ler latest.yml do servidor de updates. Verifique se a release foi publicada.'
    )
  }
}

hydrateReleaseLink()
