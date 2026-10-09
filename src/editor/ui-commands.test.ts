import { describe, expect, it } from 'vitest'
import { createEditor } from './session'
import { runUiCommand, uiCommands } from './ui-commands'
import { shortcutCommand } from './shortcuts'

describe('shared editor commands', () => {
  it('checks current availability and preserves undo and clipboard isolation', () => {
    const editor = createEditor()
    expect(runUiCommand(editor, 'paste')).toBe(false)
    expect(runUiCommand(editor, 'group')).toBe(false)
    runUiCommand(editor, 'add-concept', { position: { x: 300, y: 150 } })
    expect(editor.getActiveGraph().nodes[0]?.position).toEqual({ x: 300, y: 150 })
    runUiCommand(editor, 'copy')
    runUiCommand(editor, 'convert-agent')
    expect(editor.getActiveGraph().nodes[0]?.type).toBe('agent')
    runUiCommand(editor, 'undo')
    expect(editor.getActiveGraph().nodes[0]?.type).toBe('concept')
    runUiCommand(editor, 'paste')
    expect(editor.getActiveGraph().nodes).toHaveLength(2)
    expect(runUiCommand(createEditor(), 'paste')).toBe(false)
    editor.select()
    expect(uiCommands(editor).find(c => c.id === 'duplicate')?.enabled).toBe(false)
    expect(runUiCommand(editor, 'duplicate')).toBe(false)
    expect(editor.getActiveGraph().nodes).toHaveLength(2)
  })

  it('keeps text editing, dialog controls and unrelated modifier combinations native', () => {
    const event = { key: 'в', code: 'KeyD', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, isComposing: false, defaultPrevented: false }
    expect(shortcutCommand(event, 'canvas')).toBe('add-data')
    expect(shortcutCommand({ ...event, ctrlKey: true }, 'canvas')).toBe('duplicate')
    expect(shortcutCommand({ ...event, ctrlKey: true }, 'text')).toBeUndefined()
    expect(shortcutCommand({ ...event, ctrlKey: true, shiftKey: true }, 'canvas')).toBeUndefined()
    expect(shortcutCommand({ ...event, key: ' ', code: 'Space' }, 'button')).toBeUndefined()
    expect(shortcutCommand({ ...event, key: 'F1', code: 'F1' }, 'dialog')).toBeUndefined()
    expect(shortcutCommand({ ...event, code: 'KeyF', ctrlKey: true }, 'text')).toBe('search')
    expect(shortcutCommand({ ...event, code: 'KeyZ', metaKey: true, shiftKey: true }, 'canvas')).toBe('redo')
    expect(shortcutCommand({ ...event, repeat: true }, 'canvas')).toBeUndefined()
  })
})
