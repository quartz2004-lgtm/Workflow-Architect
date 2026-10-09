import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { deleteSelection, duplicate, groupSelection } from '../editor/actions'
import type { Alignment } from '../editor/organization'

export const alignments: { value: Alignment; label: string }[] = [
  { value: 'left', label: 'По левому краю' }, { value: 'center', label: 'По центру X' }, { value: 'right', label: 'По правому краю' },
  { value: 'top', label: 'По верхнему краю' }, { value: 'middle', label: 'По центру Y' }, { value: 'bottom', label: 'По нижнему краю' },
  { value: 'horizontal', label: 'Распределить по X' }, { value: 'vertical', label: 'Распределить по Y' },
]
export function MultiInspector({ count }: { count: number }) {
  const editor = useEditor()
  const ids = useStore(editor.selectionStore, s => s.nodeIds)
  return <><h2>Выбрано: {count}</h2><p className="muted">Изменения выделения применяются одной операцией и поддерживают undo.</p>
    <div className="inline-actions"><button onClick={() => editor.safely(() => groupSelection(editor))} disabled={!ids.length}>Сгруппировать</button><button onClick={() => editor.safely(() => duplicate(editor))}>Дублировать</button><button onClick={() => editor.safely(() => deleteSelection(editor))}>Удалить выделение</button></div>
    <details className="inspector-section" open><summary>Выравнивание</summary><div className="alignment-actions">{alignments.map(item => <button key={item.value} disabled={ids.length < 2} onClick={() => editor.safely(() => editor.execute({ type: 'align', ids, alignment: item.value }))}>{item.label}</button>)}</div></details>
  </>
}
