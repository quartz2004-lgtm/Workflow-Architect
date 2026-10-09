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

import { useStore } from 'zustand'
import { useEditor } from './context'

export function Breadcrumbs() {
  const editor = useEditor()
  const { path, graphId } = useStore(editor.navigationStore)
  const project = useStore(editor.projectStore, s => s.project)
  return <nav className="breadcrumbs" aria-label="Путь workflow">{path.map((id, index) => <span key={id ?? 'root'}>{index > 0 && <span className="breadcrumb-separator">/</span>}<button aria-current={id === graphId ? 'page' : undefined} onClick={() => editor.navigate(id)}>{id ? project.subworkflows.find(g => g.id === id)?.title ?? 'Subworkflow' : project.project.name}</button></span>)}</nav>
}
