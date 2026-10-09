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

import type { Autosave } from '../persistence/autosave'

declare global {
  interface Window {
    workflowDesktop?: { onBeforeClose: (save: () => Promise<boolean>) => void }
  }
}

let autosave: Autosave | undefined
export function attachDesktopAutosave(next: Autosave) { autosave = next }

// Browser builds do not require a native bridge. The domain and store stay portable.
window.workflowDesktop?.onBeforeClose(async () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  // Inspector commits on blur; allow React to finish that event before flushing.
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  if (!autosave) return true
  await autosave.flush()
  return autosave.statusStore.getState().status === 'saved'
})
