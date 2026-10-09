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
