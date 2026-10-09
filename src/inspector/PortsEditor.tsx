import { useEditor } from '../app/context'
import { createId } from '../domain/factories'
import { connectionLabels } from '../domain/catalog'
import { edgeTypeSchema, nodeSchema, type WorkflowNode } from '../domain/schema'
import { ContractEditor } from './ContractEditor'
import { SelectField, TextField } from './controls'

export function PortsEditor({ node }: { node: WorkflowNode }) {
  const editor = useEditor()
  const update = (ports: WorkflowNode['ports']) => editor.safely(() => editor.execute({ type: 'configure-node', node: nodeSchema.parse({ ...node, ports }) }))
  return <details className="inspector-section"><summary>Порты · {node.ports.length}</summary>
    {node.ports.map(port => <div className="port-editor" key={port.id}>
      <TextField key={port.name} label="Название порта" helpKey="port.name" value={port.name} commit={name => update(node.ports.map(p => p.id === port.id ? { ...p, name } : p))} />
      <SelectField label="Направление порта" helpKey="port.direction" value={port.direction} empty={false} options={['input', 'output']} commit={direction => update(node.ports.map(p => p.id === port.id ? { ...p, direction: direction === 'input' ? 'input' : 'output' } : p))} />
      <SelectField label="Тип порта" helpKey="port.kind" value={port.kind} empty={false} options={Object.entries(connectionLabels).map(([value, label]) => ({ value, label }))} commit={kind => update(node.ports.map(p => p.id === port.id ? { ...p, kind: edgeTypeSchema.parse(kind) } : p))} />
      <ContractEditor label="Контракт порта" helpKey="port.contract" value={port.contract} commit={contract => update(node.ports.map(p => p.id === port.id ? { ...p, contract } : p))} />
      <button className="text-button" onClick={() => update(node.ports.filter(p => p.id !== port.id))}>Удалить порт</button>
    </div>)}
    <div className="inline-actions"><button onClick={() => update([...node.ports, { id: createId(), name: 'input', direction: 'input', kind: 'flow' }])}>＋ Вход</button><button onClick={() => update([...node.ports, { id: createId(), name: 'output', direction: 'output', kind: 'flow' }])}>＋ Выход</button></div>
    <p className="muted">Изменение занятого порта требует сначала изменить или удалить его связь.</p>
  </details>
}
