import { useState } from 'react'
import { useStore } from 'zustand'
import { useEditor } from './context'
import { engineeringTypes, nodeCatalog } from '../domain/catalog'
import type { NodeType } from '../domain/schema'
import { addNode, copy, deleteSelection, duplicate, groupSelection, paste, selectAll } from '../editor/actions'
import { Modal } from '../shared/Modal'

export function CommandPalette() {
  const editor = useEditor()
  const insertion = useStore(editor.uiStore, s => s.insertion)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const selected = editor.selectionStore.getState().nodeIds
  const concepts = editor.getActiveGraph().nodes.filter(node => selected.includes(node.id) && node.type === 'concept')
  const close = () => editor.uiStore.setState({ palette: false, insertion: null })
  const items = [
    ...Object.entries(nodeCatalog).map(([type, item]) => ({ id: type, title: `${item.icon} ${item.label}`, subtitle: item.description, run: () => addNode(editor, type as NodeType, insertion ?? undefined) })),
    ...concepts.length ? engineeringTypes.map(type => ({ id: `convert-${type}`, title: `Convert → ${nodeCatalog[type].label}`, subtitle: `Выбранных Concept: ${concepts.length}`, run: () => editor.execute({ type: 'batch', commands: concepts.map(node => ({ type: 'convert-node', id: node.id, target: type })) }) })) : [],
    { id: 'group', title: 'Сгруппировать выделение', subtitle: 'G', run: () => groupSelection(editor) },
    { id: 'duplicate', title: 'Дублировать', subtitle: 'Ctrl/Cmd D', run: () => duplicate(editor) },
    { id: 'copy', title: 'Копировать', subtitle: 'Ctrl/Cmd C', run: () => copy(editor) },
    { id: 'paste', title: 'Вставить', subtitle: 'Ctrl/Cmd V', run: () => paste(editor, insertion ?? undefined) },
    { id: 'all', title: 'Выделить всё', subtitle: 'Ctrl/Cmd A', run: () => selectAll(editor) },
    { id: 'delete', title: 'Удалить выделение', subtitle: 'Delete', run: () => deleteSelection(editor) },
    { id: 'fit', title: 'Показать весь граф', subtitle: 'F', run: () => editor.canvasStore.setState({ action: 'fit-project' }) },
    { id: 'fit-selection', title: 'Показать выделение', subtitle: 'Shift F', run: () => editor.canvasStore.setState({ action: 'fit-selection' }) },
    { id: 'validate', title: 'Validate', subtitle: 'Проверка архитектуры', run: () => editor.validationStore.setState({ open: true }) },
    { id: 'export', title: 'Экспорт проекта', subtitle: 'ZIP / JSON / YAML / Markdown / Codex', run: () => editor.exportStore.setState({ open: true, target: editor.projectStore.getState().project.settings.exportDefault ?? 'archive' }) },
    { id: 'search', title: 'Найти узел', subtitle: 'Ctrl/Cmd F', run: () => editor.uiStore.setState({ search: true }) },
    { id: 'projects', title: 'Открыть проекты', subtitle: 'Создать / импортировать', run: () => editor.uiStore.setState({ projects: true }) },
    { id: 'help', title: 'Горячие клавиши', subtitle: '?', run: () => editor.uiStore.setState({ help: true }) },
  ]
  const results = items.filter(item => `${item.title} ${item.subtitle}`.toLowerCase().includes(query.toLowerCase()))
  const choose = (item: typeof items[number]) => { close(); editor.safely(item.run) }
  return <Modal title="Команды и узлы" close={close}><input className="palette-input" autoFocus role="combobox" aria-label="Поиск команд" aria-controls="command-results" aria-expanded="true" aria-activedescendant={results[index] ? `command-${results[index].id}` : undefined} value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }} onKeyDown={e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && results[index]) { e.preventDefault(); choose(results[index]) }
  }} /><div className="command-results" id="command-results" role="listbox" aria-label="Доступные команды">{results.map((item, i) => <div role="option" aria-selected={i === index} id={`command-${item.id}`} key={item.id} onMouseEnter={() => setIndex(i)} onClick={() => choose(item)}><strong>{item.title}</strong><span>{item.subtitle}</span></div>)}</div>{!results.length && <p className="muted">Ничего не найдено.</p>}</Modal>
}
