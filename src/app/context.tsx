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
