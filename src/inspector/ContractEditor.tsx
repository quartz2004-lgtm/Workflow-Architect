import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { contractSchema, type Contract } from '../domain/schema'
import { jsonSchemaProblem } from '../validation/json-schema'
import { JsonField, SelectField, TextField } from './controls'
import { FieldHeading } from '../help/FieldHelp'
import type { FieldHelpKey } from '../help/field-help'

export function ContractEditor({ label, value, commit, helpKey }: { label: string; value?: Contract; commit: (value: Contract | undefined) => void; helpKey?: FieldHelpKey }) {
  const editor = useEditor()
  const schemas = useStore(editor.projectStore, s => s.project.schemas)
  return <fieldset className="contract-editor"><legend><FieldHeading label={label} helpKey={helpKey} /></legend><SelectField helpKey="contract.format" label={`${label}: формат`} value={value?.kind ?? ''}
    options={[{ value: 'informal', label: 'Свободное описание' }, { value: 'json-schema', label: 'JSON Schema' }, { value: 'schema-ref', label: 'Общая схема' }]}
    commit={kind => {
      if (!kind) commit(undefined)
      else if (kind === 'informal') commit({ kind, description: '' })
      else if (kind === 'json-schema') commit({ kind, schema: { type: 'object' } })
      else if (schemas[0]) commit({ kind: 'schema-ref', schemaId: schemas[0].id })
      else editor.uiStore.setState({ error: 'Сначала создайте общую схему в разделе «Ресурсы».' })
    }} />
    {value?.kind === 'informal' && <TextField key={value.description} helpKey="contract.description" label={`${label}: описание`} multiline value={value.description} commit={description => commit({ kind: 'informal', description })} />}
    {value?.kind === 'json-schema' && <JsonField key={JSON.stringify(value.schema)} helpKey="contract.json" label={`${label}: JSON Schema`} value={value.schema} validate={jsonSchemaProblem} commit={schema => commit(contractSchema.parse({ kind: 'json-schema', schema }))} />}
    {value?.kind === 'schema-ref' && <SelectField helpKey="contract.reference" label={`${label}: схема`} value={value.schemaId} options={schemas.map(s => ({ value: s.id, label: s.name }))} empty={false} commit={schemaId => commit({ kind: 'schema-ref', schemaId })} />}
  </fieldset>
}
