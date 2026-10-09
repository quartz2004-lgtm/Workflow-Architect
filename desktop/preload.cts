import { contextBridge, ipcRenderer } from 'electron'

// This is the complete native surface. No filesystem, shell, or generic IPC API.
contextBridge.exposeInMainWorld('workflowDesktop', {
  onBeforeClose: (save: () => Promise<boolean>) => {
    ipcRenderer.removeAllListeners('workflow:before-close')
    ipcRenderer.on('workflow:before-close', (_event, request: unknown) => {
      if (typeof request !== 'string') return
      void Promise.resolve().then(save).then(
        saved => ipcRenderer.send('workflow:close-result', request, saved === true),
        () => ipcRenderer.send('workflow:close-result', request, false),
      )
    })
    ipcRenderer.send('workflow:ready')
  },
})
