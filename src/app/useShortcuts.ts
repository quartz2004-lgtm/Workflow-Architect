import { useEffect } from 'react'
import { addNode, copy, deleteSelection, duplicate, groupSelection, paste, selectAll } from '../editor/actions'
import type { Editor } from '../editor/session'

export function useShortcuts(editor: Editor) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key === 'F1' && !(target instanceof HTMLElement && target.closest('dialog'))) {
        event.preventDefault(); editor.uiStore.setState({ help: true }); return
      }
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], dialog')) return
      const modified = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      let action: (() => void) | undefined
      if (modified) {
        const actions: Record<string, () => void> = { z: event.shiftKey ? editor.redo : editor.undo, c: () => copy(editor), v: () => paste(editor), d: () => duplicate(editor), a: () => selectAll(editor), k: () => editor.uiStore.setState({ palette: true }), f: () => editor.uiStore.setState({ search: true }) }
        action = actions[key]
      } else if (!event.altKey) {
        const actions: Record<string, () => void> = {
          ' ': () => editor.uiStore.setState({ palette: true }), g: () => groupSelection(editor), f: () => editor.canvasStore.setState({ action: event.shiftKey ? 'fit-selection' : 'fit-project' }),
          '0': () => editor.canvasStore.setState({ action: 'reset' }), '+': () => editor.canvasStore.setState({ action: 'zoom-in' }), '=': () => editor.canvasStore.setState({ action: 'zoom-in' }), '-': () => editor.canvasStore.setState({ action: 'zoom-out' }),
          escape: () => editor.select(), '?': () => editor.uiStore.setState({ help: true }), delete: () => deleteSelection(editor), backspace: () => deleteSelection(editor),
          n: () => { addNode(editor, 'concept') }, a: () => { addNode(editor, 'agent') }, t: () => { addNode(editor, 'trigger') }, u: () => { addNode(editor, 'tool') },
          l: () => { addNode(editor, 'logic') }, d: () => { addNode(editor, 'data') }, h: () => { addNode(editor, 'human') }, s: () => { addNode(editor, 'subworkflow') },
          r: () => { addNode(editor, 'artifact') }, m: () => { addNode(editor, 'note') },
        }
        if (!(target instanceof HTMLElement && target.closest('button') && (key === ' ' || key === 'enter'))) action = actions[key]
      }
      if (action) { event.preventDefault(); editor.safely(action) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [editor])
}
