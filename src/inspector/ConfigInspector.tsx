import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { configureNode, readConfig } from '../domain/configuration'
import { createId } from '../domain/factories'
import { graphEntries } from '../domain/graphs'
import { contractSchema, type WorkflowNode } from '../domain/schema'
import { inspectorSections, type ConfigField } from './fields'
import { JsonField, SelectField, TextField } from './controls'
import { ContractEditor } from './ContractEditor'
import { PromptEditor } from './PromptEditor'
import { configHelpKey } from '../help/field-help'
import { FieldHeading } from '../help/FieldHelp'

function ConfigControl({ node, field }: { node: WorkflowNode; field: ConfigField }) {
  const editor = useEditor()
  const project = useStore(editor.projectStore, s => s.project)
  const value = readConfig(node.config, field.path)
  const commit = (next: unknown) => editor.safely(() => {
    const current = editor.getActiveGraph().nodes.find(n => n.id === node.id)
    if (current) editor.execute({ type: 'configure-node', node: configureNode(current, field.path, next) })
  })
  const stringValue = typeof value === 'string' ? value : ''
  const helpKey = field.helpKey ?? configHelpKey(node.type, field.path)
  const options = graphEntries(project).flatMap(entry => entry.graph.nodes).filter(n => n.id !== node.id && (!field.nodeType || n.type === field.nodeType)).map(n => ({ value: n.id, label: `${n.title} · ${n.type}` }))
  switch (field.kind) {
    case 'select': return <SelectField label={field.label} helpKey={helpKey} value={stringValue} options={field.options ?? []} commit={value => commit(value || undefined)} />
    case 'contract': return <ContractEditor label={field.label} helpKey={helpKey} value={value === undefined ? undefined : contractSchema.parse(value)} commit={commit} />
    case 'prompt': return <PromptEditor value={stringValue} commit={commit} title={node.title} />
    case 'json': return <JsonField label={field.label} helpKey={helpKey} value={value} commit={commit} />
    case 'node-ref': return <SelectField label={field.label} helpKey={helpKey} value={stringValue} options={options} commit={value => commit(value || undefined)} />
    case 'prompt-ref': return <SelectField label={field.label} helpKey={helpKey} value={stringValue} options={project.prompts.map(p => ({ value: p.id, label: p.name }))} commit={value => commit(value || undefined)} />
    case 'node-list': {
      const selected = Array.isArray(value) ? value as string[] : []
      return <fieldset className="checkbox-list"><legend><FieldHeading label={field.label} helpKey={helpKey} /></legend>{options.length ? options.map(option => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={e => commit(e.target.checked ? [...selected, option.value] : selected.filter(id => id !== option.value))} />{option.label}</label>) : <p className="muted">Добавьте подходящий узел на Canvas.</p>}</fieldset>
    }
    case 'number': return <TextField label={field.label} helpKey={helpKey} value={typeof value === 'number' ? String(value) : ''} type="number" commit={text => commit(text === '' ? undefined : Number(text))} />
    case 'list': return <TextField label={field.label} helpKey={helpKey} value={Array.isArray(value) ? value.join('\n') : ''} multiline hint="Один элемент на строку" commit={text => commit(text.split('\n').map(s => s.trim()).filter(Boolean))} />
    default: return <TextField label={field.label} helpKey={helpKey} value={stringValue} multiline={field.kind === 'multiline'} commit={commit} />
  }
}

export function ConfigInspector({ node }: { node: WorkflowNode }) {
  const editor = useEditor()
  return <>{inspectorSections[node.type].map(section => <details className="inspector-section" key={section.title} open><summary>{section.title}</summary>
    {section.fields.map(field => <ConfigControl key={`${node.id}:${field.path}`} node={node} field={field} />)}
  </details>)}
    {node.type === 'logic' && <details className="inspector-section" open><summary>Ветви</summary>{(node.config.branches ?? []).map(branch => <div className="resource-card" key={branch.id}>
      <TextField key={branch.label} label="Название ветви" helpKey="logic.branch.label" value={branch.label} commit={label => editor.safely(() => editor.execute({ type: 'configure-node', node: { ...node, config: { ...node.config, branches: node.config.branches?.map(b => b.id === branch.id ? { ...b, label } : b) } } }))} />
      <TextField key={branch.condition} label="Условие ветви" helpKey="logic.branch.condition" value={branch.condition} commit={condition => editor.safely(() => editor.execute({ type: 'configure-node', node: { ...node, config: { ...node.config, branches: node.config.branches?.map(b => b.id === branch.id ? { ...b, condition } : b) } } }))} />
      <button onClick={() => editor.safely(() => editor.execute({ type: 'configure-node', node: { ...node, config: { ...node.config, branches: node.config.branches?.filter(b => b.id !== branch.id) } } }))}>Удалить ветвь</button>
    </div>)}<button onClick={() => editor.safely(() => editor.execute({ type: 'configure-node', node: { ...node, config: { ...node.config, branches: [...(node.config.branches ?? []), { id: createId(), label: 'Ветвь', condition: '' }] } } }))}>＋ Ветвь</button></details>}
  </>
}
