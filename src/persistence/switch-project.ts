import type { Project } from '../domain/schema'
import type { Editor } from '../editor/session'
import type { Autosave } from './autosave'

/** Never abandon an in-memory project whose last save failed. */
export async function switchProject(editor: Editor, autosave: Autosave, project: Project): Promise<void> {
  await autosave.flush()
  if (autosave.statusStore.getState().status !== 'saved') throw new Error('Текущий проект не сохранён. Повторите сохранение или скачайте JSON перед переключением.')
  await autosave.adopt(project)
  editor.replaceProject(project)
  await autosave.flush()
}
