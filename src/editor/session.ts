import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import { createStore } from 'zustand/vanilla'
import { createProject } from '../domain/factories'
import { getGraph, graphEntries, graphPath } from '../domain/graphs'
import { parseProject } from '../domain/serialization'
import type { Project } from '../domain/schema'
import { validateProject } from '../validation/validate-project'
import { applyCommand, type EditorCommand } from './commands'
import { createExportStore } from '../export/store'
import type { RecoveryReport } from '../persistence/recovery'
import { createPreviewController } from '../preview/controller'

enablePatches()
type HistoryEntry = { label: string; patches: Patch[]; inverse: Patch[]; graphId: string | null }
export function createEditor(initial: Project = createProject()) {
  const projectStore = createStore(() => ({ project: parseProject(initial), revision: 0 }))
  const historyStore = createStore(() => ({ past: [] as HistoryEntry[], future: [] as HistoryEntry[] }))
  const selectionStore = createStore(() => ({ nodeIds: [] as string[], edgeIds: [] as string[], groupIds: [] as string[] }))
  const navigationStore = createStore(() => ({ graphId: null as string | null, path: [null] as (string | null)[] }))
  const canvasStore = createStore(() => ({ zoom: 1, minimap: true, focusNodeId: null as string | null, autoHeightId: null as string | null, connectionStart: null as { nodeId: string; portId: string; direction: 'source' | 'target' } | null, center: { x: 100, y: 100 }, action: null as 'fit-project' | 'fit-selection' | 'reset' | 'zoom-in' | 'zoom-out' | null }))
  const uiStore = createStore(() => ({ error: null as string | null, resources: false, projects: false, palette: false, search: false, help: false, helpChapter: null as string | null, insertion: null as { x: number; y: number } | null }))
  const validationStore = createStore(() => ({ open: false, issues: validateProject(initial) }))
  const exportStore = createExportStore()
  const recoveryStore = createStore(() => ({ report: null as RecoveryReport | null, open: false }))
  const preview = createPreviewController()
  const pruneSelection = () => {
    const p = projectStore.getState().project
    if (navigationStore.getState().graphId && !p.subworkflows.some(g => g.id === navigationStore.getState().graphId)) navigationStore.setState({ graphId: null, path: [null] })
    const graph = getGraph(p, navigationStore.getState().graphId)
    selectionStore.setState(s => ({ nodeIds: s.nodeIds.filter(id => graph.nodes.some(n => n.id === id)), edgeIds: s.edgeIds.filter(id => graph.edges.some(e => e.id === id)), groupIds: s.groupIds.filter(id => graph.groups.some(g => g.id === id)) }))
  }
  const commit = (project: Project) => {
    preview.stop()
    projectStore.setState(s => ({ project, revision: s.revision + 1 }))
    validationStore.setState({ issues: validateProject(project) })
    pruneSelection()
  }
  const execute = (command: EditorCommand) => {
    const previous = projectStore.getState().project
    const graphId = navigationStore.getState().graphId
    const [next, patches, inverse] = produceWithPatches(previous, draft => applyCommand(draft, command, graphId))
    if (!patches.length) return
    parseProject(next)
    // Existing import diagnostics may be repaired incrementally, but commands cannot add structural errors.
    const before = new Set(validateProject(previous).filter(i => i.severity === 'error').map(i => `${i.code}:${i.entityId}`))
    const introduced = validateProject(next).find(i => i.severity === 'error' && !before.has(`${i.code}:${i.entityId}`))
    if (introduced) throw new Error(introduced.message)
    historyStore.setState(s => ({ past: [...s.past.slice(-199), { label: command.type, patches, inverse, graphId }], future: [] }))
    commit({ ...next, project: { ...next.project, updatedAt: new Date().toISOString() } })
    if (command.type === 'convert-group') selectionStore.setState({ nodeIds: [command.id], edgeIds: [], groupIds: [] })
  }
  const travel = (direction: 'undo' | 'redo') => {
    const { past, future } = historyStore.getState()
    const entry = direction === 'undo' ? past.at(-1) : future.at(-1)
    if (!entry) return
    const next = applyPatches(projectStore.getState().project, direction === 'undo' ? entry.inverse : entry.patches)
    const graphId = next.subworkflows.some(g => g.id === entry.graphId) ? entry.graphId : null
    navigationStore.setState({ graphId, path: graphPath(next, graphId) })
    historyStore.setState(direction === 'undo' ? { past: past.slice(0, -1), future: [...future, entry] } : { past: [...past, entry], future: future.slice(0, -1) })
    commit({ ...next, project: { ...next.project, updatedAt: new Date().toISOString() } })
  }
  const select = (nodeIds: string[] = [], edgeIds: string[] = [], groupIds: string[] = []) => selectionStore.setState({ nodeIds, edgeIds, groupIds })
  const navigate = (graphId: string | null) => {
    const project = projectStore.getState().project
    getGraph(project, graphId)
    navigationStore.setState({ graphId, path: graphPath(project, graphId) })
    select()
  }
  return {
    projectStore, historyStore, selectionStore, canvasStore, uiStore, validationStore, navigationStore, exportStore, recoveryStore, preview, execute, select, navigate,
    getActiveGraph: () => getGraph(projectStore.getState().project, navigationStore.getState().graphId),
    focusEntity: (id: string) => {
      const entry = graphEntries(projectStore.getState().project).find(({ graph }) => [...graph.nodes, ...graph.edges, ...graph.groups].some(entity => entity.id === id))
      if (!entry) return
      navigate(entry.id)
      const group = entry.graph.groups.find(g => g.collapsed && g.nodeIds.includes(id))
      if (group) execute({ type: 'edit-group', id: group.id, changes: { collapsed: false } })
      if (entry.graph.nodes.some(n => n.id === id)) select([id])
      else if (entry.graph.groups.some(g => g.id === id)) select([], [], [id])
      else select([], [id])
      const edge = entry.graph.edges.find(e => e.id === id)
      canvasStore.setState({ focusNodeId: edge?.sourceNode ?? id })
    },
    undo: () => travel('undo'), redo: () => travel('redo'),
    replaceProject: (value: Project) => {
      const project = parseProject(value)
      historyStore.setState({ past: [], future: [] })
      selectionStore.setState({ nodeIds: [], edgeIds: [], groupIds: [] })
      navigationStore.setState({ graphId: null, path: [null] })
      canvasStore.setState({ zoom: 1, focusNodeId: null })
      uiStore.setState({ error: null, resources: false })
      recoveryStore.setState({ report: null, open: false })
      commit(project)
    },
    safely: (action: () => void) => { try { action(); uiStore.setState({ error: null }) } catch (error) { uiStore.setState({ error: error instanceof Error ? error.message : 'Не удалось применить изменение.' }) } },
  }
}
export type Editor = ReturnType<typeof createEditor>
