import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  appUpdate: {
    getState: () => ipcRenderer.invoke('app-update:get-state'),
    check: () => ipcRenderer.invoke('app-update:check'),
    download: () => ipcRenderer.invoke('app-update:download'),
    install: () => ipcRenderer.invoke('app-update:install'),
    onStateChange: (callback) => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('app-update:state-changed', listener)

      return () => {
        ipcRenderer.removeListener('app-update:state-changed', listener)
      }
    }
  },
  system: {
    getConfig: () => ipcRenderer.invoke('system:get-config'),
    getShellInfo: () => ipcRenderer.invoke('system:get-shell-info'),
    enableNetworkAccess: (payload) => ipcRenderer.invoke('system:enable-network-access', payload),
    disableNetworkAccess: (payload) => ipcRenderer.invoke('system:disable-network-access', payload)
  },
  license: {
    getStatus: () => ipcRenderer.invoke('license:get-status'),
    activate: (payload) => ipcRenderer.invoke('license:activate', payload),
    validate: () => ipcRenderer.invoke('license:validate'),
    deactivate: () => ipcRenderer.invoke('license:deactivate')
  },
  backend: {
    getHealth: () => ipcRenderer.invoke('backend:get-health'),
    getStatus: () => ipcRenderer.invoke('backend:get-status'),
    getModerationState: () => ipcRenderer.invoke('backend:get-moderation-state'),
    cleanup: () => ipcRenderer.invoke('backend:cleanup'),
    createTestMessage: (payload) => ipcRenderer.invoke('backend:create-test-message', payload),
    approveItem: (id) => ipcRenderer.invoke('backend:approve-item', id),
    rejectItem: (id) => ipcRenderer.invoke('backend:reject-item', id),
    setLiveItem: (id) => ipcRenderer.invoke('backend:set-live-item', id),
    clearLiveItem: () => ipcRenderer.invoke('backend:clear-live-item')
  },
  overlay: {
    updateSettings: (payload) => ipcRenderer.invoke('overlay:update-settings', payload)
  },
  media: {
    sendCommand: (payload) => ipcRenderer.invoke('media:send-command', payload)
  },
  whatsapp: {
    getStatus: () => ipcRenderer.invoke('whatsapp:get-status'),
    connect: () => ipcRenderer.invoke('whatsapp:connect'),
    resetRuntime: () => ipcRenderer.invoke('whatsapp:reset-runtime'),
    logout: () => ipcRenderer.invoke('whatsapp:logout')
  },
  polls: {
    getActive: () => ipcRenderer.invoke('polls:get-active'),
    create: (payload) => ipcRenderer.invoke('polls:create', payload),
    close: () => ipcRenderer.invoke('polls:close')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
