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

export type KeyboardScope = 'canvas' | 'text' | 'button' | 'dialog'
interface ShortcutEvent { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; repeat: boolean; isComposing: boolean; defaultPrevented: boolean }
const plain: Record<string, string> = { ' ': 'palette', g: 'group', f: 'fit', '0': 'reset', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', escape: 'deselect', '?': 'help', f1: 'help', delete: 'delete', backspace: 'delete', n: 'add-concept', a: 'add-agent', t: 'add-trigger', u: 'add-tool', l: 'add-logic', d: 'add-data', h: 'add-human', s: 'add-subworkflow', r: 'add-artifact', m: 'add-note' }
const modified: Record<string, string> = { z: 'undo', c: 'copy', v: 'paste', d: 'duplicate', a: 'all', k: 'palette', f: 'search' }

export function shortcutCommand(event: ShortcutEvent, scope: KeyboardScope): string | undefined {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || scope === 'dialog') return
  const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase()
  const modifier = event.ctrlKey || event.metaKey
  if (scope === 'text' && !(modifier && (key === 'f' || key === 'k')) && key !== 'f1') return
  if (scope === 'button' && !modifier && (key === ' ' || key === 'enter')) return
  if (modifier) return event.shiftKey ? key === 'z' ? 'redo' : undefined : modified[key]
  if (event.shiftKey && key === 'f') return 'fit-selection'
  if (event.shiftKey && key !== '?' && key !== '+') return
  return plain[key]
}
