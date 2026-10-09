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
