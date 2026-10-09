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

import { useCallback, useEffect, useRef, useState } from 'react'
import { applyEdgeChanges, applyNodeChanges, Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode, ViewportPortal, useNodesInitialized, useReactFlow, type OnEdgesChange, type OnNodesChange } from '@xyflow/react'
import { useStore } from 'zustand'
import { useEditor, useGraph } from '../app/context'
import { createEdge, createNode } from '../domain/factories'
import { nodeCatalog } from '../domain/catalog'
import type { NodeType } from '../domain/schema'
import { connectionProblems } from '../validation/connections'
import { domainPosition, projectToCanvas, reconcileNode, type CanvasEdge, type CanvasNode } from './adapter'
import { WorkflowCard } from './WorkflowCard'
import { GroupCard } from './GroupCard'
import type { EditorCommand } from '../editor/commands'
import { ContextMenu, type ContextTarget } from './ContextMenu'
import { alignPosition } from './alignment'
import { WorkflowEdge } from './WorkflowEdge'
import '@xyflow/react/dist/style.css'

const nodeTypes = { workflow: WorkflowCard, 'workflow-group': GroupCard }
const edgeTypes = { smoothstep: WorkflowEdge }
function CanvasContent() {
  const editor = useEditor()
  const project = useStore(editor.projectStore, s => s.project)
  const graph = useGraph()
  const selection = useStore(editor.selectionStore)
  const minimap = useStore(editor.canvasStore, s => s.minimap)
  const focusNodeId = useStore(editor.canvasStore, s => s.focusNodeId)
  const canvasAction = useStore(editor.canvasStore, s => s.action)
  const previewStep = useStore(editor.preview.store, s => s.status !== 'complete' ? s.steps[s.index] : undefined)
  const [context, setContext] = useState<ContextTarget | null>(null)
  const closeContext = useCallback(() => setContext(null), [])
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const [{ nodes, edges }, setGraph] = useState(() => projectToCanvas(graph, selection))
  const flow = useReactFlow<CanvasNode, CanvasEdge>()
  const initialized = useNodesInitialized()
  const initiallyFitted = useRef(false)
  useEffect(() => {
    if (initialized && !initiallyFitted.current) {
      initiallyFitted.current = true
      void flow.fitView({ maxZoom: 1, padding: 0.2 })
    }
  }, [initialized, flow])
  useEffect(() => {
    if (!canvasAction) return
    if (canvasAction === 'fit-project') void flow.fitView({ maxZoom: 1, padding: 0.2 })
    else if (canvasAction === 'fit-selection') {
      const selected = editor.selectionStore.getState()
      const endpoints = flow.getEdges().filter(e => selected.edgeIds.includes(e.id)).flatMap(e => [e.source, e.target])
      void flow.fitView({ nodes: [...new Set([...selected.nodeIds, ...selected.groupIds, ...endpoints])].map(id => ({ id })), maxZoom: 1, padding: 0.3 })
    } else if (canvasAction === 'reset') void flow.zoomTo(1)
    else if (canvasAction === 'zoom-in') void flow.zoomIn()
    else void flow.zoomOut()
    editor.canvasStore.setState({ action: null })
  }, [canvasAction, flow, editor])
  useEffect(() => {
    if (!focusNodeId) return
    void flow.fitView({ nodes: [{ id: focusNodeId }], maxZoom: 1, padding: 0.5, duration: 0 })
    editor.canvasStore.setState({ focusNodeId: null })
  }, [focusNodeId, flow, editor])
  useEffect(() => {
    setGraph(previous => {
      const next = projectToCanvas(graph, selection)
      const existing = new Map(previous.nodes.map(node => [node.id, node]))
      return { ...next, nodes: next.nodes.map(node => reconcileNode(existing.get(node.id), node)), edges: next.edges.map(edge => ({ ...edge, className: `${edge.className}${previewStep?.viaEdgeIds.includes(edge.id) ? ' preview-edge' : ''}` })) }
    })
  }, [graph, selection, previewStep])
  const onNodesChange: OnNodesChange<CanvasNode> = useCallback(changes => {
    const activeGraph = editor.getActiveGraph()
    if (editor.selectionStore.getState().nodeIds.length <= 1) changes = changes.map(change => {
      if (change.type !== 'position' || !change.position || change.dragging === undefined || !activeGraph.nodes.some(n => n.id === change.id)) return change
      const absolute = domainPosition(activeGraph, change.id, change.position)
      const aligned = alignPosition(activeGraph, change.id, absolute, editor.selectionStore.getState().nodeIds, editor.canvasStore.getState().zoom)
      setGuides(change.dragging ? aligned.guides : {})
      return { ...change, position: { x: change.position.x + aligned.position.x - absolute.x, y: change.position.y + aligned.position.y - absolute.y } }
    })
    setGraph(g => ({ ...g, nodes: applyNodeChanges(changes, g.nodes) }))
    const currentSelection = editor.selectionStore.getState()
    const current = [...currentSelection.nodeIds, ...currentSelection.groupIds]
    const selected = new Set(current)
    for (const change of changes) if (change.type === 'select') { if (change.selected) selected.add(change.id); else selected.delete(change.id) }
    if (selected.size !== current.length || current.some(id => !selected.has(id))) editor.selectionStore.setState({ nodeIds: [...selected].filter(id => activeGraph.nodes.some(n => n.id === id)), groupIds: [...selected].filter(id => activeGraph.groups.some(g => g.id === id)) })
    const moved = changes.flatMap(change => change.type === 'position' && change.position && change.dragging === false ? [{ id: change.id, position: change.position }] : [])
    const groupMoves = moved.filter(item => activeGraph.groups.some(g => g.id === item.id))
    const memberIds = new Set(activeGraph.groups.filter(g => groupMoves.some(m => m.id === g.id)).flatMap(g => g.nodeIds))
    const positions = moved.filter(item => activeGraph.nodes.some(n => n.id === item.id) && !memberIds.has(item.id)).map(item => ({ ...item, position: domainPosition(activeGraph, item.id, item.position) }))
    const commands: EditorCommand[] = groupMoves.map(item => ({ type: 'move-group', ...item }))
    if (positions.length) commands.push({ type: 'move-nodes', positions })
    if (commands.length) editor.safely(() => editor.execute({ type: 'batch', commands }))
  }, [editor])
  const onEdgesChange: OnEdgesChange<CanvasEdge> = useCallback(changes => {
    setGraph(g => ({ ...g, edges: applyEdgeChanges(changes, g.edges) }))
    const current = editor.selectionStore.getState().edgeIds
    const selected = new Set(current)
    for (const change of changes) if (change.type === 'select') { if (change.selected) selected.add(change.id); else selected.delete(change.id) }
    if (selected.size !== current.length || current.some(id => !selected.has(id))) editor.selectionStore.setState({ edgeIds: [...selected] })
  }, [editor])
  return <div className="canvas-shell" aria-label="Workflow Canvas" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDrop={event => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/workflow-node')
    if (!Object.hasOwn(nodeCatalog, type)) return
    const node = createNode(type as NodeType, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    editor.safely(() => editor.execute({ type: 'create-node', node }))
    editor.select([node.id])
  }}>
    <ReactFlow<CanvasNode, CanvasEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onConnectStart={(_, start) => { if (start.nodeId && start.handleId && start.handleType) editor.canvasStore.setState({ connectionStart: { nodeId: start.nodeId, portId: start.handleId, direction: start.handleType } }) }}
      onConnectEnd={() => editor.canvasStore.setState({ connectionStart: null })}
      isValidConnection={connection => {
        const edge = createEdge(connection.source, connection.target, connection.sourceHandle ?? undefined, connection.targetHandle ?? undefined)
        edge.type = graph.nodes.find(n => n.id === edge.sourceNode)?.ports.find(p => p.id === edge.sourcePort)?.kind ?? 'flow'
        return connectionProblems(graph, edge, project).length === 0
      }}
      onConnect={connection => editor.safely(() => {
        const edge = createEdge(connection.source, connection.target, connection.sourceHandle ?? undefined, connection.targetHandle ?? undefined)
        edge.type = graph.nodes.find(n => n.id === edge.sourceNode)?.ports.find(p => p.id === edge.sourcePort)?.kind ?? 'flow'
        editor.execute({ type: 'create-edge', edge })
      })}
      onBeforeDelete={({ nodes: deletedNodes, edges: deletedEdges }) => {
        editor.safely(() => editor.execute({ type: 'delete', nodeIds: deletedNodes.filter(n => n.type === 'workflow').map(n => n.id), groupIds: deletedNodes.filter(n => n.type === 'workflow-group').map(n => n.id), edgeIds: deletedEdges.map(e => e.id) }))
        return Promise.resolve(false)
      }}
      onMove={(_, viewport) => editor.canvasStore.setState({ zoom: viewport.zoom })}
      onMoveEnd={() => {
        const bounds = document.querySelector('.canvas-shell')?.getBoundingClientRect()
        if (bounds) editor.canvasStore.setState({ center: flow.screenToFlowPosition({ x: bounds.x + bounds.width / 2 - 130, y: bounds.y + bounds.height / 2 - 75 }) })
      }}
      onPaneClick={() => editor.select()}
      onNodeContextMenu={(event, node) => {
        event.preventDefault()
        if (node.type === 'workflow-group') editor.select([], [], [node.id]); else if (!selection.nodeIds.includes(node.id)) editor.select([node.id])
        setContext({ x: event.clientX, y: event.clientY, position: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }), id: node.id, kind: node.type === 'workflow-group' ? 'group' : 'node' })
      }}
      onEdgeContextMenu={(event, edge) => { event.preventDefault(); editor.select([], [edge.id]); setContext({ x: event.clientX, y: event.clientY, position: { x: 0, y: 0 }, id: edge.id, kind: 'edge' }) }}
      onPaneContextMenu={event => { event.preventDefault(); setContext({ x: event.clientX, y: event.clientY, position: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }), kind: 'canvas' }) }}
      onNodeDoubleClick={(_, node) => { if (node.type === 'workflow' && node.data.node.type === 'subworkflow' && node.data.node.config.subworkflowId) editor.navigate(node.data.node.config.subworkflowId) }}
      onDoubleClick={event => {
        if (!(event.target instanceof Element) || !event.target.classList.contains('react-flow__pane')) return
        editor.uiStore.setState({ palette: true, insertion: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) })
      }}
      colorMode="dark" minZoom={0.2} maxZoom={2} snapToGrid={project.settings.snap} snapGrid={[20, 20]}
      selectionOnDrag selectionMode={SelectionMode.Partial} panOnDrag={[1, 2]} multiSelectionKeyCode="Shift"
      zoomOnDoubleClick={false} deleteKeyCode={null}>
      {project.settings.grid && <Background gap={20} size={1} />}
      <Controls showInteractive={false} />
      {minimap && <MiniMap pannable zoomable nodeColor="var(--border-strong)" maskColor="var(--minimap-mask)" />}
      <ViewportPortal><svg className="alignment-guides" width="1" height="1">{guides.x !== undefined && <line x1={guides.x} x2={guides.x} y1={-10000} y2={10000} />}{guides.y !== undefined && <line y1={guides.y} y2={guides.y} x1={-10000} x2={10000} />}</svg></ViewportPortal>
    </ReactFlow>
    <div className="canvas-label"><span>{project.settings.defaultMode.toUpperCase()} CANVAS</span><span>Идея → Архитектура</span></div>
    {!graph.nodes.length && <div className="empty-state"><div className="empty-symbol">◇</div><span className="eyebrow">НАЧНИТЕ С ИДЕИ</span><h1>Сначала замысел.<br />Затем — система.</h1><p>Добавьте первый шаг. Соедините идеи.<br />Технические детали можно уточнить позже.</p><button className="primary" onClick={() => editor.safely(() => editor.execute({ type: 'create-node', node: createNode('concept', flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })) }))}>＋ Создать Concept Node</button><button className="empty-example" onClick={() => editor.uiStore.setState({ projects: true })}>Начать с примера / новый проект</button><p className="empty-hint"><kbd>Space</kbd> — узлы и команды<br />Перетащите выходной порт на входной, чтобы соединить шаги.</p></div>}
    <button className="minimap-toggle" aria-pressed={minimap} onClick={() => editor.canvasStore.setState({ minimap: !minimap })}>Миникарта</button>
    {context && <ContextMenu target={context} close={closeContext} />}
  </div>
}
export function Canvas() { return <ReactFlowProvider><CanvasContent /></ReactFlowProvider> }
