import { memo, useEffect, useRef, type CSSProperties } from 'react'
import { Handle, NodeResizer, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { useStore } from 'zustand'
import { useEditor } from '../app/context'
import { domainPosition, type WorkflowCanvasNode } from './adapter'
import { connectionProblems } from '../validation/connections'
import { contentHeight } from './auto-height'
import { nodeAccent } from '../design-system/semantics'

export const WorkflowCard = memo(function WorkflowCard({ data, selected }: NodeProps<WorkflowCanvasNode>) {
  const editor = useEditor()
  const compact = useStore(editor.canvasStore, s => s.zoom < 0.6)
  const close = useStore(editor.canvasStore, s => s.zoom > 1.1)
  const node = data.node
  const description = node.description || (node.type === 'note' ? node.config.content || node.notes || 'Заметка об архитектуре' : 'Опишите этот шаг в Inspector')
  const ref = useRef<HTMLElement>(null)
  const autoHeight = useStore(editor.canvasStore, state => state.autoHeightId === node.id)
  const connectionStart = useStore(editor.canvasStore, state => state.connectionStart)
  useEffect(() => {
    if (!autoHeight || !ref.current) return
    const height = contentHeight(ref.current, node.size.width, description, node.type !== 'note')
    editor.canvasStore.setState({ autoHeightId: null })
    editor.safely(() => editor.execute({ type: 'resize-node', id: node.id, size: { width: node.size.width, height } }))
  }, [autoHeight, node.id, node.size.width, node.type, description, editor])
  const compatible = (port: typeof node.ports[number]) => {
    if (!connectionStart) return ''
    const forward = connectionStart.direction === 'source'
    if ((port.direction === 'input') !== forward) return 'port-incompatible'
    const graph = editor.getActiveGraph(), start = graph.nodes.find(node => node.id === connectionStart.nodeId)?.ports.find(port => port.id === connectionStart.portId)
    if (!start) return ''
    const edge = { id: node.id, sourceNode: forward ? connectionStart.nodeId : node.id, targetNode: forward ? node.id : connectionStart.nodeId, sourcePort: forward ? connectionStart.portId : port.id, targetPort: forward ? port.id : connectionStart.portId, type: start.kind, label: '', metadata: {} }
    return connectionProblems(graph, edge, editor.projectStore.getState().project).length ? 'port-incompatible' : 'port-compatible'
  }
  const previewStatus = useStore(editor.preview.store, state => {
    const index = state.steps.findIndex(step => step.nodeId === node.id)
    return index < 0 || index > state.index ? null : index === state.index && state.status !== 'complete' ? 'running' : 'success'
  })
  const diagnostic = useStore(editor.validationStore, s => s.issues.some(i => i.entityId === node.id && i.severity === 'error') ? 'error' : s.issues.some(i => i.entityId === node.id && i.severity === 'warning' && i.code !== 'unresolved-concept') ? 'warning' : null)
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => { updateNodeInternals(node.id) }, [node.id, node.ports, updateNodeInternals])
  const status = node.status === 'disabled' ? 'disabled' : previewStatus ?? diagnostic ?? node.status
  const labels = { draft: 'ЧЕРНОВИК', configured: 'НАСТРОЕН', ready: 'ГОТОВ', disabled: 'ОТКЛЮЧЁН', warning: '⚠ ПРОВЕРИТЬ', error: '! ОШИБКА', running: '▶ PREVIEW', success: '✓ ПРОСМОТРЕН' }
  return <article ref={ref} className={`workflow-card type-${node.type} ${compact ? 'compact' : node.size.height > 170 ? 'roomy' : ''}`} data-status={status} style={node.color ? { '--node-accent': `var(--${node.color})` } as CSSProperties : undefined}>
    <NodeResizer color={`var(--${node.color ?? nodeAccent[node.type]})`} isVisible={selected} minWidth={180} minHeight={100} maxWidth={800} maxHeight={1200}
      onResizeEnd={(_, size) => editor.safely(() => editor.execute({ type: 'resize-node', id: node.id, size: { width: size.width, height: size.height }, position: domainPosition(editor.getActiveGraph(), node.id, { x: size.x, y: size.y }) }))} />
    <div className="node-eyebrow"><span>{node.type === 'concept' ? '◇ CONCEPT' : node.type.toUpperCase()}</span><span>{labels[status]}</span></div>
    <h3>{node.title || 'Без названия'}</h3>
    {!compact && <p>{description}</p>}
    {close && node.type === 'agent' && <div className="node-metadata">{node.config.model?.name || 'Модель не задана'} · {node.config.toolIds?.length ?? 0} tools</div>}
    {node.ports.map(port => <Handle key={port.id} id={port.id} type={port.direction === 'input' ? 'target' : 'source'}
      position={port.direction === 'input' ? Position.Left : Position.Right}
      className={`port-${port.kind} ${compatible(port)}`} title={`${port.name} · ${port.kind} · ${port.direction}`}
      style={{ top: `${(node.ports.filter(p => p.direction === port.direction).findIndex(p => p.id === port.id) + 1) * 100 / (node.ports.filter(p => p.direction === port.direction).length + 1)}%` }} aria-label={`${port.name}: ${port.direction}`} />)}
    {!compact && node.type !== 'note' && <div className="node-foot"><span>вход</span><span>выход →</span></div>}
  </article>
})
