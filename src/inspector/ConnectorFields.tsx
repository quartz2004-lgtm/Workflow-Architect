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

import { useEffect, useState } from 'react'
import type { WorkflowNode } from '../domain/schema'
import type { ExecutionConfig } from '../domain/execution-config'
import { useProfile } from '../profiles/context'
import { integrationRequest } from '../integrations/client'
import { integrationStateSchema } from '../integrations/protocol'
import { actionConnectionKinds, type ActionName, type IntegrationConnection } from '../integrations/schema'
import { connectorCatalog, connectorContracts } from '../integrations/catalog'
import { SelectField } from './controls'
import { SourceField } from './ExecutionFields'

export function ConnectorFields({ node, commit }: { node: WorkflowNode; commit(value: ExecutionConfig): void }) {
  const profile = useProfile()?.profile, [connections, setConnections] = useState<IntegrationConnection[]>([]), [problem, setProblem] = useState('')
  useEffect(() => {
    let active = true
    if (profile && window.workflowDesktop?.runtime) void integrationRequest({ action: 'list', profileId: profile.id }).then(value => { if (active) setConnections(integrationStateSchema.parse(value).connections) }).catch(error => { if (active) setProblem(String(error)) })
    return () => { active = false }
  }, [profile])
  const operation = node.operation
  if (operation?.kind !== 'connector') return null
  const definition = connectorCatalog[operation.action], kind = actionConnectionKinds[operation.action]
  const available = connections.filter(item => item.settings.kind === kind)
  return <>
    <SelectField label="Действие подключения" helpKey="integrations.action" value={operation.action} empty={false} options={Object.entries(connectorCatalog).map(([value, item]) => ({ value, label: item.title }))} commit={value => { const action = value as ActionName; commit({ ...operation, action, fields: connectorCatalog[action].fields.filter(field => !field.optional).map(field => ({ key: field.key, source: { kind: 'literal', value: field.value }, transform: 'identity' })) }) }} />
    <SelectField label="Подключение профиля" helpKey="integrations.connection" value={operation.connectionId} options={available.map(item => ({ value: item.id, label: `${item.label}${item.enabled ? '' : ' · отключено'}` }))} commit={connectionId => { if (connectionId) commit({ ...operation, connectionId }) }} />
    {!available.length && <p className="muted">Создайте подключение в разделе «Интеграции» внизу окна.</p>}
    {problem && <p role="alert" className="field-error">{problem}</p>}
    <p className="muted">{definition.description}</p>
    {definition.fields.map(field => {
      const configured = operation.fields.find(item => item.key === field.key)
      return <fieldset className="resource-card" key={`${operation.action}:${field.key}`}><legend>{field.label}</legend>
        <label className="check-field"><input type="checkbox" checked={!!configured} onChange={event => commit({ ...operation, fields: event.target.checked ? [...operation.fields, { key: field.key, source: { kind: 'literal', value: field.value }, transform: 'identity' }] : operation.fields.filter(item => item.key !== field.key) })} />Задать поле{field.optional ? ' · необязательно' : ''}</label>
        {configured ? <SourceField node={node} value={configured.source} commit={source => commit({ ...operation, fields: operation.fields.map(item => item.key === field.key ? { ...item, source } : item) })} /> : <p className="muted">{field.optional ? 'Поле пропущено.' : 'Для Flow задайте значение. При вызове агентом поле может заполнить модель.'}</p>}
      </fieldset>
    })}
    <details><summary>Пример входного payload · {definition.version}</summary><pre>{JSON.stringify(definition.sample, null, 2)}</pre></details>
    <details><summary>Входной и выходной контракт</summary><pre>{JSON.stringify(connectorContracts(operation.action), null, 2)}</pre></details>
    <p className="muted">Источник «Вход Flow» и путь /text связывают поле с результатом предыдущего узла. Для Agent заданные здесь поля фиксированы: модель их не заменяет.</p>
  </>
}
