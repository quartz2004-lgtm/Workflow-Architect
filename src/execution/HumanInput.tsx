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
import { contractForm, readContractForm } from './contract-fields'

export function HumanInput({ schema, disabled, submit }: { schema: unknown; disabled: boolean; submit: (value: unknown) => void }) {
  const form = contractForm(schema)
  const [advanced, setAdvanced] = useState(false), [values, setValues] = useState<Record<string, string>>({})
  const [json, setJson] = useState('null'), [error, setError] = useState('')
  const technical = advanced || !form
  return <form onSubmit={event => {
    event.preventDefault()
    try { const value = technical ? JSON.parse(json) as unknown : readContractForm(form!, values); setError(''); submit(value) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
  }}>
    {!technical && form!.fields.map(field => <label key={field.key}>{field.label}{field.required ? ' · обязательно' : ' · необязательно'}
      {field.choices || field.type === 'boolean' ? <select disabled={disabled} value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}>
        <option value="">Выберите ответ</option>
        {field.choices ? field.choices.map((choice, index) => <option key={index} value={index}>{String(choice)}</option>) : <><option value="true">Да</option><option value="false">Нет</option></>}
      </select> : <input disabled={disabled} type={field.type === 'string' ? 'text' : 'number'} step={field.type === 'integer' ? 1 : 'any'} value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} />}
      {field.description && <span className="muted">{field.description}</span>}
    </label>)}
    {!form && <p className="muted">Для этой сложной схемы пока нужен технический ввод. Откройте структуру ниже или попросите автора сценария упростить форму ответа.</p>}
    {form && <label className="check-field"><input type="checkbox" disabled={disabled} checked={advanced} onChange={event => setAdvanced(event.target.checked)} />Технический ответ JSON</label>}
    {technical && <label>Ответ (JSON)<textarea disabled={disabled} value={json} onChange={event => setJson(event.target.value)} rows={4} /></label>}
    {schema !== undefined && <details><summary>Структура ответа</summary><pre>{JSON.stringify(schema, null, 2)}</pre></details>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <button disabled={disabled} type="submit">Отправить ответ</button>
  </form>
}
