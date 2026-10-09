import { memo, type CSSProperties } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { useEditor } from '../app/context'
import type { GroupCanvasNode } from './adapter'

export const GroupCard = memo(function GroupCard({ data, selected }: NodeProps<GroupCanvasNode>) {
  const editor = useEditor()
  const group = data.group
  return <section className={`group-card ${group.collapsed ? 'collapsed' : ''}`} style={group.color ? { '--group-accent': `var(--${group.color})` } as CSSProperties : undefined}>
    <NodeResizer color={`var(--${group.color ?? 'slate'})`} isVisible={selected && !group.collapsed} minWidth={180} minHeight={100} onResizeEnd={(_, size) => editor.safely(() => editor.execute({ type: 'edit-group', id: group.id, changes: { position: { x: size.x, y: size.y }, size: { width: size.width, height: size.height } } }))} />
    <header className="group-header"><span>▱ {group.title}</span><button className="nodrag" aria-label={group.collapsed ? 'Развернуть группу' : 'Свернуть группу'} onClick={() => editor.safely(() => editor.execute({ type: 'edit-group', id: group.id, changes: { collapsed: !group.collapsed } }))}>{group.collapsed ? '+' : '−'}</button></header>
    {group.collapsed && <p>{group.nodeIds.length} узлов · Group</p>}
    <Handle id="group-in" type="target" position={Position.Left} isConnectable={false} className="group-port" />
    <Handle id="group-out" type="source" position={Position.Right} isConnectable={false} className="group-port" />
  </section>
})
