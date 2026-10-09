import { useEffect, useState } from 'react'
import { portableSnapshotBytes } from '../domain/limits'
import { useEditor } from './context'
import { createId, createProject } from '../domain/factories'
import { openStoredProject } from '../persistence/open-project'
import { createBackupRepository, type SnapshotBackup } from '../persistence/backups'
import type { Project } from '../domain/schema'
import type { Autosave } from '../persistence/autosave'
import type { ManagedProjectRepository, ProjectSummary } from '../persistence/repository'
import { switchProject } from '../persistence/switch-project'
import { Modal } from '../shared/Modal'
import { downloadText } from '../shared/download'
import { validateProject } from '../validation/validate-project'
import { importProjectFiles } from '../export/import-project'
import { createTemplate, templates } from '../domain/templates'
import { recoverProject, type RecoveryReport } from '../persistence/recovery'
import { RecoveryDetails } from '../persistence/RecoveryDetails'

export function ProjectsDialog({ repository, autosave }: { repository: ManagedProjectRepository; autosave: Autosave }) {
  const editor = useEditor()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [backups, setBackups] = useState<SnapshotBackup[]>([])
  const [name, setName] = useState('Новый workflow')
  const [error, setError] = useState<string | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [pending, setPending] = useState<Project | null>(null)
  const [busy, setBusy] = useState(false)
  const [recovery, setRecovery] = useState<RecoveryReport | null>(null)
  useEffect(() => {
    let mounted = true
    void repository.list().then(items => { if (mounted) setProjects(items) }).catch(error => { if (mounted) setError(String(error)) })
    void createBackupRepository().list().then(items => { if (mounted) setBackups(items) }).catch(error => { if (mounted) setError(String(error)) })
    return () => { mounted = false }
  }, [repository])
  const open = async (project: Project, report: RecoveryReport | null = null) => {
    setBusy(true); setError(null)
    try { await switchProject(editor, autosave, project); editor.recoveryStore.setState({ report }); editor.uiStore.setState({ projects: false }) }
    catch (error) { setError(error instanceof Error ? error.message : 'Не удалось открыть проект') }
    finally { setBusy(false) }
  }
  const load = async (id: string) => {
    setBusy(true); setRaw(null); setError(null); setRecovery(null); setPending(null)
    try {
      const text = await repository.load(id)
      if (text === undefined) throw new Error('Проект не найден.')
      setRaw(text)
      try { await open(await openStoredProject(text)) }
      catch (error) { setRecovery(recoverProject(text)); throw error }
    } catch (error) { setError(error instanceof Error ? error.message : 'Ошибка загрузки') }
    finally { setBusy(false) }
  }
  const importFiles = async (files: File[]) => {
    if (!files.length) return
    setPending(null); setRaw(null); setError(null); setRecovery(null); setBusy(true)
    let recoverable: string | null = null
    try {
      const file = files[0]!
      if (files.length === 1 && /\.json$/i.test(file.name) && file.size <= portableSnapshotBytes) { recoverable = await file.text(); setRaw(recoverable) }
      setPending(await importProjectFiles(files))
    } catch (error) { setError(error instanceof Error ? error.message : 'Ошибка импорта'); if (recoverable) setRecovery(recoverProject(recoverable)) }
    finally { setBusy(false) }
  }
  const importProject = async () => {
    if (!pending) return
    try {
      const existing = await repository.load(pending.project.id)
      const copy = existing === undefined ? pending : { ...pending, project: { ...pending.project, id: createId(), name: `${pending.project.name.slice(0, 290)} — импорт`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
      await open(copy)
    } catch (error) { setError(error instanceof Error ? error.message : 'Ошибка импорта') }
  }
  return <Modal wide title="Локальные проекты" close={() => { if (!busy) editor.uiStore.setState({ projects: false }) }}>
    {error && <div className="field-error" role="alert"><p>{error}</p>{raw !== null && !recovery && <button onClick={() => downloadText('project-recovery.json', raw)}>Скачать исходный JSON</button>}</div>}
    {recovery && <section className="recovery-offer"><RecoveryDetails report={recovery} />{recovery.project && <button className="primary" disabled={busy} onClick={() => { void open(recovery.project!, recovery) }}>Открыть восстановленную копию</button>}</section>}
    <div className="project-manager"><section><h3>Открыть проект</h3><div className="project-list">
      {projects.length ? projects.map(project => <button disabled={busy} key={project.id} onClick={() => { void load(project.id) }}><strong>{project.name}</strong><span>{project.damaged ? 'Требуется восстановление' : new Date(project.updatedAt).toLocaleDateString('ru-RU')}</span></button>) : <p className="muted">Сохранённые проекты появятся здесь.</p>}
    </div></section><section><h3>Новый проект</h3><form onSubmit={event => { event.preventDefault(); void open(createProject(name.trim() || 'Новый workflow')) }}><label className="field"><span>Название нового проекта</span><input maxLength={300} value={name} onChange={e => setName(e.target.value)} /></label><button className="primary" disabled={busy}>Создать пустой проект</button></form>
      <h3>Импорт проекта</h3><label className="field"><span>Файл проекта</span><input type="file" multiple accept=".json,.yaml,.yml,.zip,application/json,application/zip" disabled={busy} onChange={e => { void importFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} /></label>
      <p className="muted">ZIP, JSON/YAML snapshot — до 64 MiB. Пара project.json + workflow.json и распакованный ZIP — до 128 MiB.</p>
      <p className="muted">При совпадении ID импортируется отдельная копия. Существующий проект сохраняется.</p>
      {pending && <div className="import-preview"><strong>{pending.project.name}</strong><p>{pending.nodes.length} узлов · {pending.edges.length} связей</p><p>{validateProject(pending).filter(i => i.severity === 'error').length} Errors · {validateProject(pending).filter(i => i.severity === 'warning').length} Warnings</p><button disabled={busy} onClick={() => { void importProject() }}>Открыть импорт</button></div>}
    </section></div>
    <section className="templates-section"><h3>Начать с примера</h3><p className="muted">Готовые структуры для изучения редактора. Модели и внешние сервисы настраиваются при реализации.</p><div className="template-list">{templates.map(template => <button key={template.id} disabled={busy} onClick={() => { void open(createTemplate(template.id)) }}><span className="template-icon" aria-hidden="true">{template.icon}</span><strong>{template.title}</strong><span>{template.description}</span></button>)}</div></section>
    {!!backups.length && <details><summary>Резервные копии до изменения формата · {backups.length}</summary>{backups.map(backup => <div className="inline-actions" key={backup.id}><span>{new Date(backup.createdAt).toLocaleString('ru-RU')} · формат {backup.sourceVersion}</span><button onClick={() => downloadText(`project-before-migration-${backup.id}.json`, backup.raw)}>Скачать исходную копию</button></div>)}</details>}
  </Modal>
}
