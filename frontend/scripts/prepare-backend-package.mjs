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
  rmSync(stagingRoot, {
    recursive: true,
    force: true
  })

  mkdirSync(stagingRoot, { recursive: true })

  cpSync(join(backendRoot, 'package.json'), join(stagingRoot, 'package.json'))
  cpSync(join(backendRoot, 'package-lock.json'), join(stagingRoot, 'package-lock.json'))
  cpSync(join(backendRoot, 'src'), join(stagingRoot, 'src'), {
    recursive: true
  })
}

function installProductionDependencies() {
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npmExecutable, ['ci', '--omit=dev'], {
    cwd: stagingRoot,
    stdio: 'inherit',
    shell: false
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
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
