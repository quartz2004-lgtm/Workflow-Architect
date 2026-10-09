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

import { useState } from 'react'
import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { createId } from '../domain/factories'
import { contractSchema } from '../domain/schema'
import { Modal } from '../shared/Modal'
import { jsonSchemaProblem } from '../validation/json-schema'
import { JsonField, TextField } from './controls'
import { PromptEditor } from './PromptEditor'

export function ResourcesDialog() {
  const editor = useEditor()
  const project = useStore(editor.projectStore, s => s.project)
  const error = useStore(editor.uiStore, s => s.error)
  const [selected, setSelected] = useState<string | null>(null)
  const schema = project.schemas.find(s => s.id === selected)
  const prompt = project.prompts.find(p => p.id === selected)
  return <Modal wide title="Общие схемы и prompts" close={() => editor.uiStore.setState({ resources: false, error: null })}>
    {error && <p role="alert" className="field-error">{error}</p>}
    <div className="resources-layout"><nav aria-label="Ресурсы проекта"><span className="eyebrow">JSON SCHEMAS</span>
      {project.schemas.map(s => <button className={s.id === selected ? 'active' : ''} key={s.id} onClick={() => setSelected(s.id)}>{s.name}</button>)}
      <button onClick={() => editor.safely(() => { const id = createId(); editor.execute({ type: 'save-schema', schema: { id, name: 'Новая схема', definition: { type: 'object', properties: {} } } }); setSelected(id) })}>＋ Общая схема</button>
      <span className="eyebrow">PROMPTS</span>{project.prompts.map(p => <button className={p.id === selected ? 'active' : ''} key={p.id} onClick={() => setSelected(p.id)}>{p.name}</button>)}
      <button onClick={() => editor.safely(() => { const id = createId(); editor.execute({ type: 'save-prompt', prompt: { id, name: 'Новый prompt', content: '' } }); setSelected(id) })}>＋ Общий prompt</button>
    </nav><div className="resource-detail">
      {schema ? <><TextField key={`${schema.id}:${schema.name}`} label="Название схемы" helpKey="resource.schemaName" value={schema.name} commit={name => editor.safely(() => editor.execute({ type: 'save-schema', schema: { ...schema, name } }))} />
        <JsonField key={`${schema.id}:${JSON.stringify(schema.definition)}`} label="JSON Schema" helpKey="contract.json" value={schema.definition} validate={jsonSchemaProblem} commit={value => {
          const contract = contractSchema.parse({ kind: 'json-schema', schema: value })
          if (contract.kind === 'json-schema') editor.safely(() => editor.execute({ type: 'save-schema', schema: { ...schema, definition: contract.schema } }))
        }} /><p className="muted">Draft-07 по умолчанию. Для 2020-12 задайте $schema. Схема хранится под устойчивым ID; переименование сохраняет ссылки.</p>
        <button onClick={() => editor.safely(() => editor.execute({ type: 'delete-schema', id: schema.id }))}>Удалить схему</button></> : prompt ? <>
        <TextField key={`${prompt.id}:${prompt.name}`} label="Название prompt" helpKey="resource.promptName" value={prompt.name} commit={name => editor.safely(() => editor.execute({ type: 'save-prompt', prompt: { ...prompt, name } }))} />
        <PromptEditor key={prompt.id} value={prompt.content} title={prompt.name} commit={content => editor.safely(() => editor.execute({ type: 'save-prompt', prompt: { ...prompt, content } }))} />
        <button onClick={() => editor.safely(() => editor.execute({ type: 'delete-prompt', id: prompt.id }))}>Удалить prompt</button>
      </> : <div className="resource-empty"><h3>Контракты, общие для системы</h3><p className="muted">Создайте схему или prompt и ссылайтесь на них из узлов. Изменения ресурсов входят в undo/redo.</p></div>}
    </div></div>
  </Modal>
}
