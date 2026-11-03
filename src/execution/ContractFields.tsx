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

import type { ContractForm } from './contract-fields'

export function ContractFields({ form, values, change, disabled }: {
  form: ContractForm; values: Record<string, string>; change: (values: Record<string, string>) => void; disabled: boolean
}) {
  return <>{form.fields.map(field => <label key={field.key}>{field.label}{field.required ? ' · обязательно' : ' · необязательно'}
    {field.choices || field.type === 'boolean' ? <select disabled={disabled} value={values[field.key] ?? ''} onChange={event => change({ ...values, [field.key]: event.target.value })}>
      <option value="">Выберите ответ</option>
      {field.choices ? field.choices.map((choice, index) => <option key={index} value={index}>{String(choice)}</option>) : <><option value="true">Да</option><option value="false">Нет</option></>}
    </select> : <input disabled={disabled} type={field.type === 'string' ? 'text' : 'number'} step={field.type === 'integer' ? 1 : 'any'} value={values[field.key] ?? ''} onChange={event => change({ ...values, [field.key]: event.target.value })} />}
    {field.description && <span className="muted">{field.description}</span>}
  </label>)}</>
}
