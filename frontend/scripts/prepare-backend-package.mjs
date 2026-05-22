import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const frontendRoot = resolve(__dirname, '..')
const workspaceRoot = resolve(frontendRoot, '..')
const backendRoot = join(workspaceRoot, 'backend')
const stagingRoot = join(frontendRoot, '.backend-dist')

function copyRequiredBackendFiles() {
  console.log('[prepare:backend] Limpando staging anterior...')
  rmSync(stagingRoot, {
    recursive: true,
    force: true
  })

  mkdirSync(stagingRoot, { recursive: true })

  console.log('[prepare:backend] Copiando package.json, package-lock.json e src...')
  cpSync(join(backendRoot, 'package.json'), join(stagingRoot, 'package.json'))
  cpSync(join(backendRoot, 'package-lock.json'), join(stagingRoot, 'package-lock.json'))
  cpSync(join(backendRoot, 'src'), join(stagingRoot, 'src'), {
    recursive: true
  })
}

function installProductionDependencies() {
  console.log('[prepare:backend] Instalando dependências de produção do backend...')

  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm ci --omit=dev'], {
          cwd: stagingRoot,
          stdio: 'inherit'
        })
      : spawnSync('npm', ['ci', '--omit=dev'], {
          cwd: stagingRoot,
          stdio: 'inherit'
        })

  if (result.error) {
    console.error('[prepare:backend] Falha ao executar npm ci:', result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }

  console.log('[prepare:backend] Backend de produção pronto em .backend-dist.')
}

function ensurePackageLockExists() {
  if (!existsSync(join(backendRoot, 'package-lock.json'))) {
    console.error('backend/package-lock.json não encontrado. Gere o lockfile do backend antes do build.')
    process.exit(1)
  }
}

ensurePackageLockExists()
copyRequiredBackendFiles()
installProductionDependencies()
