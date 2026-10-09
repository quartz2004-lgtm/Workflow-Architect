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
