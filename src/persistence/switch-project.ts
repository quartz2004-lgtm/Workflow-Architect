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
