import { useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { Modal } from '../shared/Modal'
import { downloadBlob, downloadText } from '../shared/download'
import { exportFiles, exportTargets } from './exporters'
import { createArchive } from './archive'
import type { ExportFiles } from './package-format'

export function ExportDialog() {
  const editor = useEditor()
  const project = useStore(editor.projectStore, s => s.project)
  const { target, busy, error } = useStore(editor.exportStore)
  const issues = useStore(editor.validationStore, s => s.issues)
  const [selected, setSelected] = useState('')
  const prepared = useMemo<{ files: ExportFiles; error: string | null }>(() => {
    try { return { files: exportFiles(project, target), error: null } }
    catch (error) { return { files: {}, error: error instanceof Error ? error.message : 'Ошибка экспорта.' } }
  }, [project, target])
  const paths = Object.keys(prepared.files)
  const path = paths.includes(selected) ? selected : paths[0]
  const preview = path ? prepared.files[path] ?? '' : ''
  const close = () => { if (!busy) editor.exportStore.setState({ open: false, error: null }) }
  const download = async () => {
    editor.exportStore.setState({ busy: true, error: null })
    try {
      if (target === 'archive' || target === 'codex') downloadBlob(target === 'codex' ? 'codex-package.zip' : 'workflow-project.zip', new Blob([await createArchive(prepared.files)], { type: 'application/zip' }))
      else if (path) downloadText(path, prepared.files[path]!)
    } catch (error) { editor.exportStore.setState({ error: error instanceof Error ? error.message : 'Не удалось скачать пакет.' }) }
    finally { editor.exportStore.setState({ busy: false }) }
  }
  return <Modal wide title="Экспорт проекта" close={close}>
    <p className="muted">{project.project.name} · весь проект, включая вложенные графы</p>
    <div className="export-layout"><div className="export-targets" role="group" aria-label="Формат экспорта">{exportTargets.map(item => <button key={item.id} aria-pressed={target === item.id} disabled={busy} onClick={() => { setSelected(''); editor.exportStore.setState({ target: item.id, error: null }) }}><strong>{item.label}{target === item.id && <span aria-hidden="true"> ✓</span>}</strong><span>{item.description}</span></button>)}</div>
      <section className="export-preview" aria-label="Содержимое экспорта"><label className="field"><span>Файлы пакета · {paths.length}</span><select aria-label="Предпросмотр файла" disabled={!paths.length} value={path ?? ''} onChange={e => setSelected(e.target.value)}>{paths.map(name => <option key={name}>{name}</option>)}</select></label>
        {path ? <pre tabIndex={0} aria-label="Текст файла">{preview.slice(0, 30_000)}{preview.length > 30_000 ? '\n… Предпросмотр сокращён. Файл будет сохранён полностью.' : ''}</pre> : <div className="export-empty">Исправьте ошибки или выберите JSON / YAML snapshot.</div>}
      </section></div>
    <div className="export-footer"><div><span>{issues.filter(i => i.severity === 'error').length} Errors · {issues.filter(i => i.severity === 'warning').length} Warnings · {issues.filter(i => i.severity === 'info').length} Notes</span><p className="muted">Warnings не блокируют экспорт. Snapshot сохраняет черновик с диагностикой.</p></div><button className="primary" disabled={busy || !!prepared.error} onClick={() => { void download() }}>{busy ? 'Подготовка…' : 'Скачать экспорт'}</button></div>
    {(prepared.error || error) && <p className="field-error" role="alert">{prepared.error || error}</p>}
    {!!issues.length && <button disabled={busy} onClick={() => { close(); editor.validationStore.setState({ open: true }) }}>Открыть диагностику</button>}
  </Modal>
}
