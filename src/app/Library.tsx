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

import { useEditor } from './context'
import { createNode } from '../domain/factories'
import { engineeringTypes, nodeCatalog } from '../domain/catalog'
import type { NodeType } from '../domain/schema'
import { groupSelection } from '../editor/actions'

export function Library() {
  const editor = useEditor()
  const add = (type: NodeType) => {
    const count = editor.getActiveGraph().nodes.length
    const node = createNode(type, { x: 100 + (count % 3) * 320, y: 100 + Math.floor(count / 3) * 220 })
    editor.safely(() => editor.execute({ type: 'create-node', node }))
    editor.select([node.id])
  }
  return <aside className="library"><div className="panel-heading">БИБЛИОТЕКА <span>01</span></div><div className="library-content">
    {([['CONCEPT', ['concept', 'note']], ['ENGINEERING', engineeringTypes]] as const).map(([title, types]) => <section key={title}><span className="eyebrow">{title}</span>{types.map(type => <button key={type} draggable onDragStart={e => { e.dataTransfer.setData('application/workflow-node', type); e.dataTransfer.effectAllowed = 'copy' }} className={`library-item type-${type}`} onClick={() => add(type)}><span className="library-icon">{nodeCatalog[type].icon}</span><span><strong>{nodeCatalog[type].label}</strong><small>{nodeCatalog[type].description}</small></span><span>＋</span></button>)}</section>)}
      <button className="library-item" onClick={() => editor.safely(() => groupSelection(editor))}><span className="library-icon">▱</span><span><strong>Group</strong><small>Объединить выбранные узлы</small></span><span>G</span></button>
    </div><div className="library-bottom"><button onClick={() => editor.uiStore.setState({ resources: true })}>Схемы и prompts</button><p className="muted">Перетащите блок на Canvas или нажмите, чтобы добавить.</p></div></aside>
}
