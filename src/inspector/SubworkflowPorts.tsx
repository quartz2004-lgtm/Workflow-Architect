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

import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { nodeSchema, type WorkflowNode } from '../domain/schema'
import { SelectField } from './controls'

export function SubworkflowPorts({ node }: { node: Extract<WorkflowNode, { type: 'subworkflow' }> }) {
  const editor = useEditor()
  const graph = useStore(editor.projectStore, s => s.project.subworkflows.find(g => g.id === node.config.subworkflowId))
  if (!graph) return null
  return <details className="inspector-section" open><summary>Открытые входы и выходы</summary>
    <button onClick={() => editor.navigate(graph.id)}>Открыть внутренний Canvas</button>
    {node.ports.map(port => <SelectField key={port.id} helpKey="subworkflow.binding" label={`${port.name} · ${port.direction}`} value={port.binding ? `${port.binding.nodeId}:${port.binding.portId ?? ''}` : ''}
      options={graph.nodes.flatMap(n => n.ports.filter(p => p.direction === port.direction && p.kind === port.kind).map(p => ({ value: `${n.id}:${p.id}`, label: `${n.title} → ${p.name}` })))}
      commit={value => editor.safely(() => {
        const [nodeId, portId] = value.split(':')
        editor.execute({ type: 'configure-node', node: nodeSchema.parse({ ...node, ports: node.ports.map(p => p.id === port.id ? { ...p, binding: nodeId ? { nodeId, portId: portId || undefined } : undefined } : p) }) })
      })} />)}
    {!node.ports.length && <p className="muted">Добавьте входы и выходы в секции «Порты», затем свяжите их с внутренними узлами.</p>}
  </details>
}
