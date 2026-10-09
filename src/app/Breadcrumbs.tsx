import { useStore } from 'zustand'
import { useEditor } from './context'

export function Breadcrumbs() {
  const editor = useEditor()
  const { path, graphId } = useStore(editor.navigationStore)
  const project = useStore(editor.projectStore, s => s.project)
  return <nav className="breadcrumbs" aria-label="Путь workflow">{path.map((id, index) => <span key={id ?? 'root'}>{index > 0 && <span className="breadcrumb-separator">/</span>}<button aria-current={id === graphId ? 'page' : undefined} onClick={() => editor.navigate(id)}>{id ? project.subworkflows.find(g => g.id === id)?.title ?? 'Subworkflow' : project.project.name}</button></span>)}</nav>
}
