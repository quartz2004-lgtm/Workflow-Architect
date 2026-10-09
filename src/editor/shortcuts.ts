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
