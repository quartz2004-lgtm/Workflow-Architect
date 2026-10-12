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

import type { ExecutionConfig } from '../domain/execution-config'
import { nodeSchema, type WorkflowNode } from '../domain/schema'
import { useEditor } from '../app/context'
import { configureOperation, operationOptions } from '../execution/configure-operation'
import { LiteralField, PredicateFields, SourceField } from './ExecutionFields'
import { SelectField, TextField } from './controls'
import { FieldHelp } from '../help/FieldHelp'
import { AiOperationFields } from './AiOperationFields'

export function OperationInspector({ node }: { node: WorkflowNode }) {
  const editor = useEditor(), options = operationOptions[node.type], op = node.operation
  if (!options) return node.type === 'note' ? null : <p className="muted">{node.type === 'concept' ? 'Для запуска преобразуйте идею в исполнимый узел.' : 'Исполнение Agent и Tool появится на следующем этапе. Сейчас они доступны для проектирования.'}</p>
  const commit = (operation: ExecutionConfig) => editor.safely(() => editor.execute({ type: 'configure-node', node: nodeSchema.parse({ ...node, operation }) }))
  const ports = node.ports.filter(port => port.direction === 'output' && port.kind === 'flow').map(port => ({ value: port.id, label: port.name }))
  const port = (label: string, value: string, change: (portId: string) => void) => <SelectField label={label} helpKey="runtime.branch" value={value} empty={false} options={ports} commit={change} />
  return <details className="inspector-section operation-section" open><summary>Локальное выполнение · 0.4</summary>
    <SelectField label="Операция" helpKey="runtime.operation" value={op?.kind ?? ''} options={options} commit={kind => editor.safely(() => editor.execute({ type: 'configure-node', node: configureOperation(node, kind) }))} />
    {!op && <p className="muted">Выберите действие. Описательные настройки сами по себе не исполняются.</p>}
    {op?.kind === 'manual' && <p className="muted">Run передаст введённые JSON-данные на выход Trigger.</p>}
    <AiOperationFields node={node} commit={commit} />
    {op?.kind === 'merge' && <p className="muted">В паре с явно настроенным Parallel получает все результаты один раз. Вне Parallel каждый приход передаётся дальше отдельно.</p>}
    {op?.kind === 'subworkflow' && <p className="muted">Выберите вложенный граф и привяжите открытые порты ниже. Каждый вызов получает отдельный контекст.</p>}
    {op?.kind === 'map' && <>
      <div className="check-field"><label><input type="checkbox" checked={op.keepInput} onChange={event => commit({ ...op, keepInput: event.target.checked })} />Сохранить остальные поля</label><FieldHelp helpKey="runtime.map" /></div>
      {op.fields.map((field, index) => {
        const change = (next: typeof field) => commit({ ...op, fields: op.fields.map((item, i) => i === index ? next : item) })
        return <fieldset className="resource-card" key={index}><legend>Поле {index + 1}</legend>
          <TextField label="Имя выходного поля" helpKey="runtime.map" value={field.key} commit={key => change({ ...field, key })} />
          <SourceField value={field.source} node={node} commit={source => change({ ...field, source })} />
          <SelectField label="Преобразование" helpKey="runtime.transform" value={field.transform} empty={false} options={[{ value: 'identity', label: 'Без изменения' }, { value: 'text', label: 'В текст' }, { value: 'number', label: 'В число' }, { value: 'uppercase', label: 'ВЕРХНИЙ РЕГИСТР' }, { value: 'lowercase', label: 'нижний регистр' }, { value: 'trim', label: 'Убрать пробелы по краям' }, { value: 'add', label: 'Прибавить число' }]} commit={transform => change({ ...field, transform: transform as typeof field.transform, ...(transform === 'add' ? { operand: field.operand ?? 1 } : {}) })} />
          {field.transform === 'add' && <TextField label="Прибавить" helpKey="runtime.transform" type="number" value={String(field.operand)} commit={value => change({ ...field, operand: Number(value) })} />}
          <button onClick={() => commit({ ...op, fields: op.fields.filter((_, i) => i !== index) })}>Удалить поле {index + 1}</button>
        </fieldset>
      })}
      <button disabled={op.fields.length >= 100} onClick={() => { let index = op.fields.length + 1; while (op.fields.some(field => field.key === `field${index}`)) index++; commit({ ...op, fields: [...op.fields, { key: `field${index}`, source: { kind: 'input', pointer: '' }, transform: 'identity' }] }) }}>＋ Выходное поле</button>
    </>}
    {(op?.kind === 'if' || op?.kind === 'loop') && <PredicateFields value={op.predicate} node={node} commit={predicate => commit({ ...op, predicate })} />}
    {op?.kind === 'if' && <>{port('Если да → порт', op.truePortId, truePortId => commit({ ...op, truePortId }))}{port('Если нет → порт', op.falsePortId, falsePortId => commit({ ...op, falsePortId }))}</>}
    {op?.kind === 'loop' && <>
      <TextField label="Максимум итераций" helpKey="runtime.loop" type="number" value={String(op.maxIterations)} commit={value => commit({ ...op, maxIterations: Number(value) })} />
      {port('Условие истинно → тело', op.bodyPortId, bodyPortId => commit({ ...op, bodyPortId }))}{port('Условие ложно → выход', op.exitPortId, exitPortId => commit({ ...op, exitPortId }))}
    </>}
    {op?.kind === 'switch' && <>
      <SourceField value={op.source} node={node} commit={source => commit({ ...op, source })} />
      {op.cases.map((item, index) => <fieldset className="resource-card" key={index}><legend>Вариант {index + 1}</legend>
        <LiteralField label="Совпадение" value={item.value} commit={value => commit({ ...op, cases: op.cases.map((item, i) => i === index ? { ...item, value } : item) })} />
        {port('Выход варианта', item.portId, portId => commit({ ...op, cases: op.cases.map((item, i) => i === index ? { ...item, portId } : item) }))}
        <button disabled={op.cases.length === 1} onClick={() => commit({ ...op, cases: op.cases.filter((_, i) => i !== index) })}>Удалить вариант {index + 1}</button>
      </fieldset>)}
      <button disabled={op.cases.length >= 50 || !ports.some(port => port.value !== op.defaultPortId && !op.cases.some(item => item.portId === port.value))} onClick={() => { const free = ports.find(port => port.value !== op.defaultPortId && !op.cases.some(item => item.portId === port.value)); if (free) commit({ ...op, cases: [...op.cases, { portId: free.value, value: `case${op.cases.length + 1}` }] }) }}>＋ Вариант из свободного порта</button>
      <p className="muted">Новый Flow-выход можно добавить в разделе «Порты».</p>
      {port('Иначе → порт', op.defaultPortId, defaultPortId => commit({ ...op, defaultPortId }))}
    </>}
    {op?.kind === 'human' && <>
      <TextField label="Вопрос человеку" helpKey="runtime.human" value={op.question} multiline commit={question => commit({ ...op, question })} />
      <SelectField label="Ожидаемый ответ" helpKey="runtime.human" value={op.mode} empty={false} options={[{ value: 'approval', label: 'Подтвердить / отклонить' }, { value: 'input', label: 'Ввести JSON-значение' }]} commit={mode => commit({ ...op, mode: mode === 'input' ? mode : 'approval' })} />
      <TextField label="Ожидание, секунд" helpKey="runtime.timeout" type="number" value={String(op.timeoutMs / 1000)} commit={value => commit({ ...op, timeoutMs: Number(value) * 1000 })} />
    </>}
    {op?.kind === 'artifact' && <>
      <TextField label="Имя файла" helpKey="runtime.artifact" value={op.filename} commit={filename => commit({ ...op, filename })} />
      <SelectField label="Формат файла" helpKey="runtime.artifact" value={op.format} empty={false} options={['json', 'text']} commit={format => commit({ ...op, format: format === 'text' ? format : 'json' })} />
      <SourceField value={op.source} node={node} commit={source => commit({ ...op, source })} />
    </>}
  </details>
}
