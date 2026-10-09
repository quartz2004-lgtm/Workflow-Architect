import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { graphEntries } from '../domain/graphs'

export function ValidationPanel() {
  const editor = useEditor()
  const { issues, open } = useStore(editor.validationStore)
  const project = useStore(editor.projectStore, s => s.project)
  if (!open) return null
  return <section className="validation-panel" aria-label="Проверка проекта"><header><h2>Проверка архитектуры</h2><span>{issues.filter(i => i.severity === 'error').length} Errors · {issues.filter(i => i.severity === 'warning').length} Warnings · {issues.filter(i => i.severity === 'info').length} Notes</span><button aria-label="Закрыть проверку" onClick={() => editor.validationStore.setState({ open: false })}>×</button></header>
    <div className="validation-results">{issues.length ? issues.map((issue, index) => {
      const node = graphEntries(project).flatMap(entry => entry.graph.nodes).find(n => n.id === issue.entityId)
      const edge = graphEntries(project).flatMap(entry => entry.graph.edges).find(e => e.id === issue.entityId)
      const resource = project.schemas.find(s => s.id === issue.entityId)
      return <button className={`issue issue-${issue.severity}`} key={`${issue.entityId}:${issue.code}:${index}`} onClick={() => {
        if (node || edge) editor.focusEntity(issue.entityId)
        else if (resource) editor.uiStore.setState({ resources: true })
      }}><span>{issue.severity.toUpperCase()}</span><strong>{node?.title || edge?.label || resource?.name || 'Проект'}</strong><span>{issue.message}</span></button>
    }) : <p className="validation-clean">✓ Структурных проблем не обнаружено.</p>}</div>
  </section>
}
