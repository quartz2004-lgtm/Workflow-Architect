import { useEffect } from 'react'
import { runUiCommand } from '../editor/ui-commands'
import { shortcutCommand, type KeyboardScope } from '../editor/shortcuts'
import type { Editor } from '../editor/session'

export function useShortcuts(editor: Editor) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.getModifierState('AltGraph')) return
      const target = event.target
      let scope: KeyboardScope = 'canvas'
      if (target instanceof HTMLElement) {
        if (target.closest('dialog, [role="menu"]')) scope = 'dialog'
        else if (target.closest('input, textarea, select, [contenteditable="true"]')) scope = 'text'
        else if (target.closest('button')) scope = 'button'
      }
      const command = shortcutCommand(event, scope)
      if (command) { event.preventDefault(); runUiCommand(editor, command) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [editor])
}
