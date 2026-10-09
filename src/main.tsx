import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createProject } from './domain/factories'
import { deserializeProject } from './domain/serialization'
import { createEditor } from './editor/session'
import { startAutosave } from './persistence/autosave'
import { createRepository } from './persistence/repository'
import type { Project } from './domain/schema'
import type { RecoveryReport } from './persistence/recovery'
import { RecoveryScreen } from './persistence/RecoveryScreen'
import { attachDesktopAutosave } from './platform/desktop'
import './design-system/tokens.css'
import './design-system/app.css'

const element = document.getElementById('root')
if (!element) throw new Error('Root element is missing')
const root = createRoot(element)
root.render(<div className="boot-screen" role="status">Открываем рабочее пространство…</div>)
async function boot() {
  let raw: string | undefined
  const repository = createRepository()
  const launch = (project: Project, report: RecoveryReport | null = null) => {
    const editor = createEditor(project)
    editor.recoveryStore.setState({ report })
    const autosave = startAutosave(editor, repository)
    attachDesktopAutosave(autosave)
    if (import.meta.hot) import.meta.hot.dispose(() => autosave.stop())
    root.render(<StrictMode><App editor={editor} autosave={autosave} repository={repository} /></StrictMode>)
  }
  try {
    raw = await repository.loadActive()
    launch(raw === undefined ? createProject() : deserializeProject(raw))
  } catch (error) {
    root.render(<RecoveryScreen raw={raw} error={error instanceof Error ? error.message : 'Хранилище недоступно.'} open={launch} blank={() => launch(createProject())} />)
  }
}
void boot()
