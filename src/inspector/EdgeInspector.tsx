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

import { useEditor } from '../app/context'
import { connectionLabels } from '../domain/catalog'
import { edgeTypeSchema, type WorkflowEdge } from '../domain/schema'
import { ContractEditor } from './ContractEditor'
import { SelectField, TextField } from './controls'

export function EdgeInspector({ edge }: { edge: WorkflowEdge }) {
  const editor = useEditor()
  return <><h2>Связь</h2><SelectField label="Тип связи" helpKey="edge.type" value={edge.type} empty={false} options={Object.entries(connectionLabels).map(([value, label]) => ({ value, label }))} commit={kind => editor.safely(() => editor.execute({ type: 'set-edge-type', id: edge.id, kind: edgeTypeSchema.parse(kind) }))} />
    <TextField key={edge.label} label="Подпись" helpKey="edge.label" value={edge.label} commit={label => editor.safely(() => editor.execute({ type: 'edit-edge', id: edge.id, changes: { label } }))} />
    <TextField key={edge.condition} label="Условие" helpKey="edge.condition" value={edge.condition ?? ''} multiline commit={condition => editor.safely(() => editor.execute({ type: 'edit-edge', id: edge.id, changes: { condition } }))} />
    <ContractEditor label="Контракт связи" helpKey="edge.contract" value={edge.contract} commit={contract => editor.safely(() => editor.execute({ type: 'edit-edge', id: edge.id, changes: { contract } }))} />
    <div className="inline-actions"><button onClick={() => editor.safely(() => editor.execute({ type: 'reverse-edge', id: edge.id }))}>Развернуть связь</button><button onClick={() => editor.safely(() => editor.execute({ type: 'delete', nodeIds: [], edgeIds: [edge.id] }))}>Удалить связь</button></div>
  </>
}
