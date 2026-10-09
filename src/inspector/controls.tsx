import { useEffect, useState } from 'react'

export function TextField({ label, value, multiline = false, commit, type = 'text', hint }: { label: string; value: string; multiline?: boolean; commit: (value: string) => void; type?: 'text' | 'number'; hint?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const props = { value: draft, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: () => { if (draft !== value) commit(draft) } }
  return <label className="field"><span>{label}</span>{multiline ? <textarea {...props} rows={4} /> : <input {...props} type={type} maxLength={type === 'text' ? 300 : undefined} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />}{hint && <small>{hint}</small>}</label>
}
export function SelectField({ label, value, options, commit, empty = true }: { label: string; value: string; options: readonly (string | { value: string; label: string })[]; commit: (value: string) => void; empty?: boolean }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={e => commit(e.target.value)}>{empty && <option value="">Не задано</option>}{options.map(item => {
    const option = typeof item === 'string' ? { value: item, label: item } : item
    return <option key={option.value} value={option.value}>{option.label}</option>
  })}</select></label>
}
export function JsonField({ label, value, commit, validate }: { label: string; value: unknown; commit: (value: unknown) => void; validate?: (value: unknown) => string | null }) {
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
  return <div className="json-field"><label className="field"><span>{label}</span><textarea className="code-input" aria-invalid={!!error} value={draft} onChange={e => setDraft(e.target.value)} rows={6} spellCheck={false} /></label>
    <div className="inline-actions"><button onClick={() => action(false)}>Форматировать</button><button onClick={() => action(true)}>Применить JSON</button></div>{error && <p className="field-error" role="alert">{error}</p>}
  </div>
}
