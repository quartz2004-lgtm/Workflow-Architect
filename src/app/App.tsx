import { useProfile } from '../profiles/context'
import { ProfileMenu } from '../profiles/ProfileMenu'
import { runUiCommand } from '../editor/ui-commands'
import { lazy, Suspense, useEffect } from 'react'
import { useStore } from 'zustand'
import type { Editor } from '../editor/session'
import { Inspector } from '../inspector/Inspector'
import type { Autosave } from '../persistence/autosave'
import { EditorContext, useEditor, useGraph } from './context'
import { Library } from './Library'
import { ResourcesDialog } from '../inspector/ResourcesDialog'
import { ValidationPanel } from '../validation/ValidationPanel'
import type { ManagedProjectRepository } from '../persistence/repository'
import { Breadcrumbs } from './Breadcrumbs'
import { CommandPalette } from './CommandPalette'
import { SearchDialog } from './SearchDialog'
import { useShortcuts } from './useShortcuts'
import { Modal } from '../shared/Modal'
import { RecoveryDetails } from '../persistence/RecoveryDetails'
import { PreviewPanel } from '../preview/PreviewPanel'

const Canvas = lazy(() => import('../canvas/Canvas').then(module => ({ default: module.Canvas })))
const ExportDialog = lazy(() => import('../export/ExportDialog').then(module => ({ default: module.ExportDialog })))
const ProjectsDialog = lazy(() => import('./ProjectsDialog').then(module => ({ default: module.ProjectsDialog })))
const Almanac = lazy(() => import('../help/Almanac').then(module => ({ default: module.Almanac })))

function Workspace({ autosave, repository }: { autosave: Autosave; repository: ManagedProjectRepository }) {
  const editor = useEditor()
  const profile = useProfile()?.profile
  const name = useStore(editor.projectStore, s => s.project.project.name)
  const projectId = useStore(editor.projectStore, s => s.project.project.id)
  const graphId = useStore(editor.navigationStore, s => s.graphId)
  const graph = useGraph()
  const nodeCount = graph.nodes.length
  const edgeCount = graph.edges.length
  const history = useStore(editor.historyStore)
  const zoom = useStore(editor.canvasStore, s => s.zoom)
  const save = useStore(autosave.statusStore)
  const error = useStore(editor.uiStore, s => s.error)
  const resources = useStore(editor.uiStore, s => s.resources)
  const projects = useStore(editor.uiStore, s => s.projects)
  const palette = useStore(editor.uiStore, s => s.palette)
  const search = useStore(editor.uiStore, s => s.search)
  const help = useStore(editor.uiStore, s => s.help)
  const exporting = useStore(editor.exportStore, s => s.open)
  const recovery = useStore(editor.recoveryStore)
  const previewOpen = useStore(editor.preview.store, s => s.open)
  const mode = useStore(editor.projectStore, s => s.project.settings.defaultMode)
  const projectMotion = useStore(editor.projectStore, s => s.project.settings.motion)
  const motion = profile?.preferences.motion === 'reduced' ? 'reduced' : projectMotion
  useShortcuts(editor)
  useEffect(() => {
    const flushOnHidden = () => { if (document.visibilityState === 'hidden') void autosave.flush() }
    document.addEventListener('visibilitychange', flushOnHidden)
    return () => { document.removeEventListener('visibilitychange', flushOnHidden); editor.preview.stop() }
  }, [editor, autosave])
  const saveLabel = { saved: 'Сохранено', saving: 'Сохранение…', unsaved: 'Есть изменения', error: 'Ошибка сохранения' }[save.status]
  return <div className="app-shell" data-motion={motion} data-density={profile?.preferences.density}>
    <header className="topbar"><div className="brand" aria-label="Workflow Architect">W<span>Λ</span></div><button className="project-heading" aria-label="Открыть проекты" onClick={() => editor.uiStore.setState({ projects: true })}><span>WORKFLOW ARCHITECT</span><strong>{name} ▾</strong></button><button className="mode-badge" aria-label="Режим редактора" onClick={() => editor.execute({ type: 'edit-settings', changes: { defaultMode: mode === 'concept' ? 'engineering' : 'concept' } })}>{mode === 'concept' ? 'Concept' : 'Engineering'}</button>
      <div className="history-actions"><button aria-label="Отменить" title="Отменить · Ctrl+Z" disabled={!history.past.length} onClick={() => runUiCommand(editor, 'undo')}>↶</button><button aria-label="Повторить" title="Повторить · Ctrl+Shift+Z" disabled={!history.future.length} onClick={() => runUiCommand(editor, 'redo')}>↷</button></div>
      <span className={`save-status ${save.status}`} role="status">{save.status === 'saved' ? '✓' : '○'} {saveLabel}</span>
      <button onClick={() => editor.validationStore.setState(s => ({ open: !s.open }))}>Validate</button>
      <button onClick={() => editor.preview.start(editor.projectStore.getState().project, editor.navigationStore.getState().graphId, motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches)}>Preview</button>
      <button aria-label="Настройки проекта" title="Настройки проекта" onClick={() => editor.select()}>⚙</button>
      <button className="export-button" onClick={() => editor.exportStore.setState({ open: true, target: editor.projectStore.getState().project.settings.exportDefault ?? 'archive' })}>Экспорт <span>↗</span></button>
    </header>
    {recovery.report && <div className="recovery-banner" role="status"><span>Recovery mode · {recovery.report.issues.length} замечаний · оригинал сохранён</span><button onClick={() => editor.recoveryStore.setState({ open: true })}>Отчёт восстановления</button><button onClick={() => editor.recoveryStore.setState({ report: null, open: false })}>Завершить восстановление</button></div>}
    {(error || save.error) && <div className="error-banner" role="alert"><span>{error || save.error}</span>{save.error ? <>{save.conflict && <button onClick={() => { void autosave.saveAsCopy().catch(error => editor.uiStore.setState({ error: error instanceof Error ? error.message : String(error) })) }}>Сохранить мои правки отдельной копией</button>}<button onClick={() => { void autosave.flush() }}>Повторить сохранение</button></> : <button aria-label="Закрыть ошибку" onClick={() => editor.uiStore.setState({ error: null })}>×</button>}</div>}
    <Breadcrumbs />
    <main className="workspace"><Library /><Suspense fallback={<div className="boot-screen" role="status">Загрузка Canvas…</div>}><Canvas key={`${projectId}:${graphId}`} /></Suspense><Inspector /></main>
    <ValidationPanel />
    {previewOpen && <PreviewPanel />}
    {resources && <ResourcesDialog />}
    {recovery.report && recovery.open && <Modal wide title="Отчёт восстановления" close={() => editor.recoveryStore.setState({ open: false })}><RecoveryDetails report={recovery.report} focus={id => { editor.focusEntity(id); editor.recoveryStore.setState({ open: false }) }} /></Modal>}
    <Suspense fallback={<div className="dialog-loading" role="status">Загрузка…</div>}>
      {projects && <ProjectsDialog repository={repository} autosave={autosave} />}
      {exporting && <ExportDialog />}
      {help && <Almanac />}
    </Suspense>
    {palette && <CommandPalette />}{search && <SearchDialog />}
    <footer className="statusbar"><span className="status-brand">◇ {mode.toUpperCase()} WORKSPACE</span><span>{Math.round(zoom * 100)}%</span><span>{nodeCount} узлов <span className="divider">/</span> {edgeCount} связей</span><button onClick={() => runUiCommand(editor, 'palette')}>Команды</button><button onClick={() => runUiCommand(editor, 'search')}>Поиск</button><button title="Справка по приложению · F1 / ?" onClick={() => runUiCommand(editor, 'help')}>Альманах</button><ProfileMenu autosave={autosave} /><span className="local-label">LOCAL FIRST <span>·</span> Только на этом устройстве</span></footer>
  </div>
}
export function App({ editor, autosave, repository }: { editor: Editor; autosave: Autosave; repository: ManagedProjectRepository }) { return <EditorContext.Provider value={editor}><Workspace autosave={autosave} repository={repository} /></EditorContext.Provider> }
