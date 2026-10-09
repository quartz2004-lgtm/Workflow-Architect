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

import { useEffect, useId, useState } from 'react'
import { FieldHeading } from '../help/FieldHelp'
import type { FieldHelpKey } from '../help/field-help'

export function TextField({ label, value, multiline = false, commit, type = 'text', hint, helpKey }: { label: string; value: string; multiline?: boolean; commit: (value: string) => void; type?: 'text' | 'number'; hint?: string; helpKey?: FieldHelpKey }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const props = { id, value: draft, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: () => { if (draft !== value) commit(draft) } }
  return <div className="field"><FieldHeading label={label} htmlFor={id} helpKey={helpKey} />{multiline ? <textarea {...props} rows={4} /> : <input {...props} type={type} maxLength={type === 'text' ? 300 : undefined} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />}{hint && <small>{hint}</small>}</div>
}
export function SelectField({ label, value, options, commit, empty = true, helpKey }: { label: string; value: string; options: readonly (string | { value: string; label: string })[]; commit: (value: string) => void; empty?: boolean; helpKey?: FieldHelpKey }) {
  const id = useId()
  return <div className="field"><FieldHeading label={label} htmlFor={id} helpKey={helpKey} /><select id={id} value={value} onChange={e => commit(e.target.value)}>{empty && <option value="">Не задано</option>}{options.map(item => {
    const option = typeof item === 'string' ? { value: item, label: item } : item
    return <option key={option.value} value={option.value}>{option.label}</option>
  })}</select></div>
}
export function JsonField({ label, value, commit, validate, helpKey }: { label: string; value: unknown; commit: (value: unknown) => void; validate?: (value: unknown) => string | null; helpKey?: FieldHelpKey }) {
  const id = useId()
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2)
  const [draft, setDraft] = useState(serialized)
  useEffect(() => { setDraft(serialized) }, [serialized])
  const [error, setError] = useState<string | null>(null)
  const parse = () => {
    const parsed: unknown = draft.trim() ? JSON.parse(draft) : undefined
    const problem = parsed !== undefined ? validate?.(parsed) : null
    if (problem) throw new Error(problem)
    return parsed
  }
  const action = (save: boolean) => {
    try { const parsed = parse(); setError(null); if (save) commit(parsed); else setDraft(parsed === undefined ? '' : JSON.stringify(parsed, null, 2)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Неверный JSON') }
  }
  return <div className="json-field"><div className="field"><FieldHeading label={label} htmlFor={id} helpKey={helpKey} /><textarea id={id} className="code-input" aria-invalid={!!error} value={draft} onChange={e => setDraft(e.target.value)} rows={6} spellCheck={false} /></div>
    <div className="inline-actions"><button onClick={() => action(false)}>Форматировать</button><button onClick={() => action(true)}>Применить JSON</button></div>{error && <p className="field-error" role="alert">{error}</p>}
  </div>
}
