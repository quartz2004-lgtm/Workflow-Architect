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

import type { JsonValue, Predicate, ValueSource } from '../domain/execution-config'
import type { WorkflowNode } from '../domain/schema'
import { JsonField, SelectField, TextField } from './controls'

export function LiteralField({ label, value, commit }: { label: string; value: JsonValue; commit: (value: JsonValue) => void }) {
  const kind = value === null ? 'null' : typeof value === 'object' ? 'json' : typeof value
  return <>
    <SelectField label={`${label}: тип`} helpKey="runtime.literal" value={kind} empty={false} options={[{ value: 'string', label: 'Текст' }, { value: 'number', label: 'Число' }, { value: 'boolean', label: 'Да / нет' }, { value: 'null', label: 'Null' }, { value: 'json', label: 'Объект / массив JSON' }]} commit={kind => commit(kind === 'number' ? 0 : kind === 'boolean' ? true : kind === 'null' ? null : kind === 'json' ? {} : '')} />
    {kind === 'string' && <TextField label={label} helpKey="runtime.literal" value={String(value)} commit={commit} />}
    {kind === 'number' && <TextField label={label} helpKey="runtime.literal" type="number" value={String(value)} commit={value => commit(Number(value))} />}
    {kind === 'boolean' && <SelectField label={label} helpKey="runtime.literal" value={String(value)} options={[{ value: 'true', label: 'Да · true' }, { value: 'false', label: 'Нет · false' }]} empty={false} commit={value => commit(value === 'true')} />}
    {kind === 'json' && <JsonField label={label} helpKey="runtime.literal" value={value} commit={value => commit(value as JsonValue)} />}
  </>
}
export function SourceField({ value, node, commit }: { value: ValueSource; node: WorkflowNode; commit: (value: ValueSource) => void }) {
  const inputs = node.ports.filter(port => port.kind === 'data' && port.direction === 'input')
  return <>
    <SelectField label="Источник значения" helpKey="runtime.source" value={value.kind} empty={false} options={[{ value: 'input', label: 'Вход Flow' }, { value: 'literal', label: 'Заданное значение' }, ...(inputs.length ? [{ value: 'data', label: 'Вход Data' }] : [])]} commit={kind => commit(kind === 'literal' ? { kind, value: '' } : kind === 'data' ? { kind, portId: inputs[0]!.id, pointer: '' } : { kind: 'input', pointer: '' })} />
    {value.kind === 'data' && <SelectField label="Входной Data-порт" helpKey="runtime.source" value={value.portId} empty={false} options={inputs.map(port => ({ value: port.id, label: port.name }))} commit={portId => commit({ ...value, portId })} />}
    {value.kind === 'literal' ? <LiteralField label="Значение" value={value.value} commit={next => commit({ ...value, value: next })} /> : <TextField label="Путь к полю" helpKey="runtime.pointer" value={value.pointer} hint="/name · /items/0 · пусто = весь вход" commit={pointer => commit({ ...value, pointer })} />}
  </>
}
export function PredicateFields({ value, node, commit }: { value: Predicate; node: WorkflowNode; commit: (value: Predicate) => void }) {
  return <>
    <SourceField value={value.source} node={node} commit={source => commit({ ...value, source })} />
    <SelectField label="Проверка" helpKey="runtime.predicate" value={value.operator} empty={false} options={[{ value: 'is-true', label: 'Равно true' }, { value: 'exists', label: 'Поле существует' }, { value: 'equals', label: 'Равно' }, { value: 'not-equals', label: 'Не равно' }, { value: 'greater', label: 'Больше' }, { value: 'greater-or-equal', label: 'Больше или равно' }, { value: 'less', label: 'Меньше' }, { value: 'less-or-equal', label: 'Меньше или равно' }, { value: 'contains', label: 'Содержит' }]} commit={operator => commit({ ...value, operator: operator as Predicate['operator'], value: ['greater', 'greater-or-equal', 'less', 'less-or-equal'].includes(operator) ? typeof value.value === 'number' ? value.value : 0 : value.value ?? '' })} />
    {!['exists', 'is-true'].includes(value.operator) && <LiteralField label="Сравнить со значением" value={value.value ?? null} commit={next => commit({ ...value, value: next })} />}
  </>
}
