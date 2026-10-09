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

import { createContext, useContext } from 'react'
import type { Editor } from '../editor/session'
import { useStore } from 'zustand'
import { getGraph } from '../domain/graphs'
export const EditorContext = createContext<Editor | null>(null)
export function useEditor() {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('Editor provider is missing')
  return editor
}
export function useGraph() {
  const editor = useEditor()
  const graphId = useStore(editor.navigationStore, s => s.graphId)
  return useStore(editor.projectStore, s => getGraph(s.project, graphId))
}
