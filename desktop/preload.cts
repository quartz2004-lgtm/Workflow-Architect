/*
Copyright (C) 2026  quartz2004

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://gnu.org>.
*/

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
