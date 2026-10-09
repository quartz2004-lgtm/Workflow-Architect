import { useStore } from 'zustand'
import { useEditor, useGraph } from '../app/context'
import { engineeringTypes, nodeCatalog } from '../domain/catalog'
import { nodeSchema, projectSchema } from '../domain/schema'
import { ConfigInspector } from './ConfigInspector'
import { EdgeInspector } from './EdgeInspector'
import { PortsEditor } from './PortsEditor'
import { SelectField, TextField } from './controls'
import { GroupInspector } from './GroupInspector'
import { MultiInspector } from './MultiInspector'
import { SubworkflowPorts } from './SubworkflowPorts'

const fields = [
  { key: 'title', label: 'Название', multiline: false },
  { key: 'description', label: 'Описание', multiline: true },
  { key: 'notes', label: 'Заметки', multiline: true },
] as const

export function Inspector() {
  const editor = useEditor()
  const selection = useStore(editor.selectionStore)
  const project = useStore(editor.projectStore, s => s.project)
  const graph = useGraph()
  const count = selection.nodeIds.length + selection.edgeIds.length + selection.groupIds.length
  const node = count === 1 ? graph.nodes.find(n => n.id === selection.nodeIds[0]) : undefined
  const edge = count === 1 ? graph.edges.find(e => e.id === selection.edgeIds[0]) : undefined
  const group = count === 1 ? graph.groups.find(g => g.id === selection.groupIds[0]) : undefined
  return <aside className="inspector"><div className="panel-heading">INSPECTOR <span>{node ? node.type.toUpperCase() : edge ? 'CONNECTION' : group ? 'GROUP' : count > 1 ? 'SELECTION' : 'PROJECT'}</span></div>
    <div className="inspector-content">
      {count > 1 ? <MultiInspector count={count} /> : group ? <GroupInspector group={group} /> : node ? <>
        <div className="inspector-intro"><span className="eyebrow">{nodeCatalog[node.type].label}</span><h2>{node.type === 'concept' ? 'От идеи к структуре' : nodeCatalog[node.type].description}</h2></div>
        {node.type === 'concept' && <SelectField label="Преобразовать в" value="" options={engineeringTypes.map(value => ({ value, label: nodeCatalog[value].label }))} commit={target => { if (engineeringTypes.some(type => type === target)) editor.safely(() => editor.execute({ type: 'convert-node', id: node.id, target: target as typeof engineeringTypes[number] })) }} />}
        <details className="inspector-section" open><summary>Идентификация</summary>
          {fields.map(field => <TextField key={`${node.id}:${field.key}:${node[field.key]}`} label={field.label} value={node[field.key]} multiline={field.multiline} commit={value => editor.safely(() => editor.execute({ type: 'edit-node', id: node.id, changes: { [field.key]: value } }))} />)}
          <TextField key={`${node.id}:tags:${node.tags.join()}`} label="Теги" value={node.tags.join(', ')} hint="Через запятую" commit={value => editor.safely(() => editor.execute({ type: 'edit-node', id: node.id, changes: { tags: value.split(',').map(s => s.trim()).filter(Boolean) } }))} />
          <TextField key={`${node.id}:links:${node.links.join()}`} label="Ссылки" value={node.links.join('\n')} multiline hint="Одна HTTPS/HTTP ссылка на строку" commit={value => editor.safely(() => editor.execute({ type: 'edit-node', id: node.id, changes: { links: value.split('\n').map(s => s.trim()).filter(Boolean) } }))} />
          <SelectField label="Статус" value={node.status} options={['draft', 'configured', 'ready', 'disabled']} empty={false} commit={status => editor.safely(() => editor.execute({ type: 'configure-node', node: nodeSchema.parse({ ...node, status }) }))} />
          <SelectField label="Цвет акцента" value={node.color ?? ''} options={['neutral', 'violet', 'cyan', 'emerald', 'amber', 'blue', 'rose', 'indigo', 'slate']} commit={color => editor.safely(() => editor.execute({ type: 'configure-node', node: nodeSchema.parse({ ...node, color: color || undefined }) }))} />
        </details>
        <ConfigInspector node={node} />
        {node.type === 'subworkflow' && <SubworkflowPorts node={node} />}
        {node.type !== 'note' && <PortsEditor node={node} />}
        <div className="property-summary"><span>Размер</span><span>{Math.round(node.size.width)} × {Math.round(node.size.height)}</span></div>
        <button className="auto-height-button" title="Подогнать высоту к тексту; изменение можно отменить" onClick={() => editor.canvasStore.setState({ autoHeightId: node.id })}>Автовысота по содержимому</button>
      </> : edge ? <EdgeInspector key={edge.id} edge={edge} /> : <>
        <div className="inspector-intro"><span className="eyebrow">О ПРОЕКТЕ</span><h2>Спроектируйте систему</h2><p>Рабочее пространство для идей, связей и инженерных решений.</p></div>
        <TextField key={project.project.name} label="Название проекта" value={project.project.name} commit={name => editor.safely(() => editor.execute({ type: 'edit-project', changes: { name } }))} />
        <TextField key={project.project.description} label="Описание проекта" value={project.project.description} multiline commit={description => editor.safely(() => editor.execute({ type: 'edit-project', changes: { description } }))} />
        <details className="inspector-section" open><summary>Настройки Canvas</summary>
          <SelectField label="Режим по умолчанию" value={project.settings.defaultMode} options={['concept', 'engineering']} empty={false} commit={defaultMode => editor.execute({ type: 'edit-settings', changes: { defaultMode: defaultMode === 'engineering' ? 'engineering' : 'concept' } })} />
          <label className="check-field"><input type="checkbox" checked={project.settings.grid} onChange={e => editor.execute({ type: 'edit-settings', changes: { grid: e.target.checked } })} />Сетка</label>
          <label className="check-field"><input type="checkbox" checked={project.settings.snap} onChange={e => editor.execute({ type: 'edit-settings', changes: { snap: e.target.checked } })} />Привязка к сетке</label>
          <SelectField label="Анимация" value={project.settings.motion} options={[{ value: 'system', label: 'Системные настройки' }, { value: 'reduced', label: 'Уменьшить движение' }]} empty={false} commit={motion => editor.execute({ type: 'edit-settings', changes: { motion: motion === 'reduced' ? 'reduced' : 'system' } })} />
          <SelectField label="Экспорт по умолчанию" value={project.settings.exportDefault ?? 'archive'} options={['archive', 'json', 'yaml', 'markdown', 'codex']} empty={false} commit={value => editor.execute({ type: 'edit-settings', changes: { exportDefault: projectSchema.shape.settings.shape.exportDefault.parse(value) } })} />
        </details><button onClick={() => editor.uiStore.setState({ resources: true })}>Общие схемы и prompts</button>
        <div className="property-summary"><span>Узлы</span><strong>{project.nodes.length}</strong><span>Связи</span><strong>{project.edges.length}</strong><span>Хранение</span><span>На этом устройстве</span></div>
      </>}
    </div><div className="inspector-footer">WORKFLOW ARCHITECT <span>0.1 / ENGINEERING ALPHA</span></div>
  </aside>
}
