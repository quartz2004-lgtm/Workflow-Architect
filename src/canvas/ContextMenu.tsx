import { useEffect, useRef } from 'react'
import { useEditor } from '../app/context'
import type { Position } from '../domain/schema'
import { copy, deleteSelection, duplicate, groupSelection, paste, selectAll } from '../editor/actions'
import { engineeringTypes, nodeCatalog } from '../domain/catalog'

export interface ContextTarget { x: number; y: number; position: Position; id?: string; kind: 'node' | 'edge' | 'group' | 'canvas' }
export function ContextMenu({ target, close }: { target: ContextTarget; close: () => void }) {
  const editor = useEditor()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const listener = (e: PointerEvent) => { if (e.target instanceof Node && !ref.current?.contains(e.target)) close() }
    window.addEventListener('pointerdown', listener)
    return () => window.removeEventListener('pointerdown', listener)
  }, [close])
  const graph = editor.getActiveGraph()
  const node = graph.nodes.find(n => n.id === target.id)
  const group = graph.groups.find(g => g.id === target.id)
  const run = (action: () => void) => { close(); editor.safely(action) }
  const button = (label: string, action: () => void) => <button key={label} role="menuitem" onClick={() => run(action)}>{label}</button>
  return <div ref={ref} role="menu" aria-label="Контекстное меню" className="context-menu" style={{ left: Math.min(target.x, window.innerWidth - 250), top: Math.min(target.y, window.innerHeight - 410) }} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const buttons = Array.from(ref.current?.querySelectorAll('button') ?? []); const i = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus() }
  }}>
    {target.kind === 'canvas' ? <>
      {button('Добавить узел…', () => editor.uiStore.setState({ palette: true, insertion: target.position }))}
      {button('Вставить', () => paste(editor, target.position))}{button('Выделить всё', () => selectAll(editor))}{button('Показать весь граф', () => editor.canvasStore.setState({ action: 'fit-project' }))}
    </> : target.kind === 'edge' && target.id ? <>
      {button('Редактировать контракт', () => editor.select([], [target.id!]))}
      {['flow', 'data', 'tool-access', 'reference'].map(kind => button(`Тип: ${kind}`, () => editor.execute({ type: 'set-edge-type', id: target.id!, kind: kind as 'flow' | 'data' | 'tool-access' | 'reference' })))}
      {button('Развернуть связь', () => editor.execute({ type: 'reverse-edge', id: target.id! }))}{button('Удалить связь', () => deleteSelection(editor))}
    </> : group ? <>
      {button('Редактировать группу', () => editor.select([], [], [group.id]))}{button(group.collapsed ? 'Развернуть' : 'Свернуть', () => editor.execute({ type: 'edit-group', id: group.id, changes: { collapsed: !group.collapsed } }))}
      {button('Преобразовать в Subworkflow', () => editor.execute({ type: 'convert-group', id: group.id }))}{button('Разгруппировать', () => editor.execute({ type: 'ungroup', id: group.id }))}
      {button('Дублировать', () => duplicate(editor))}{button('Удалить группу с узлами', () => deleteSelection(editor))}
    </> : node ? <>
      {button('Редактировать', () => editor.select([node.id]))}{button('Копировать', () => copy(editor))}{button('Дублировать', () => duplicate(editor))}{button('Сгруппировать', () => groupSelection(editor))}
      {node.type === 'concept' && engineeringTypes.map(type => button(`Convert → ${nodeCatalog[type].label}`, () => editor.execute({ type: 'convert-node', id: node.id, target: type })))}
      {button(node.status === 'disabled' ? 'Включить' : 'Отключить', () => editor.execute({ type: 'edit-node', id: node.id, changes: { status: node.status === 'disabled' ? 'draft' : 'disabled' } }))}{button('Удалить', () => deleteSelection(editor))}
    </> : null}
  </div>
}
