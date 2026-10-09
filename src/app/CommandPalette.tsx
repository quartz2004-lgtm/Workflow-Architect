import { useState } from 'react'
import { useStore } from 'zustand'
import { useEditor } from './context'
import { uiCommands, runUiCommand } from '../editor/ui-commands'
import { Modal } from '../shared/Modal'

export function CommandPalette() {
  const editor = useEditor()
  const insertion = useStore(editor.uiStore, s => s.insertion)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const close = () => editor.uiStore.setState({ palette: false, insertion: null })
  const context = { position: insertion ?? undefined }
  const items = uiCommands(editor, context).filter(item => item.palette !== false && item.enabled)
  const results = items.filter(item => `${item.title} ${item.subtitle}`.toLowerCase().includes(query.toLowerCase()))
  const choose = (item: typeof items[number]) => { close(); runUiCommand(editor, item.id, context) }
  return <Modal title="Команды и узлы" close={close}><input className="palette-input" autoFocus role="combobox" aria-label="Поиск команд" aria-controls="command-results" aria-expanded="true" aria-activedescendant={results[index] ? `command-${results[index].id}` : undefined} value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }} onKeyDown={e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && results[index]) { e.preventDefault(); choose(results[index]) }
  }} /><div className="command-results" id="command-results" role="listbox" aria-label="Доступные команды">{results.map((item, i) => <div role="option" aria-selected={i === index} id={`command-${item.id}`} key={item.id} onMouseEnter={() => setIndex(i)} onClick={() => choose(item)}><strong>{item.title}</strong><span>{item.subtitle}</span></div>)}</div>{!results.length && <p className="muted">Ничего не найдено.</p>}</Modal>
}
