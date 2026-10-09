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

import { useEffect, useRef } from 'react'
import { useEditor } from '../app/context'
import type { Position } from '../domain/schema'
import { uiCommands, runUiCommand } from '../editor/ui-commands'
import { engineeringTypes } from '../domain/catalog'

export interface ContextTarget { x: number; y: number; position: Position; id?: string; kind: 'node' | 'edge' | 'group' | 'canvas' }
export function ContextMenu({ target, close }: { target: ContextTarget; close: () => void }) {
  const editor = useEditor()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const listener = (e: PointerEvent) => { if (e.target instanceof Node && !ref.current?.contains(e.target)) close() }
    window.addEventListener('pointerdown', listener)
    return () => window.removeEventListener('pointerdown', listener)
  }, [close])
  const graph = editor.getActiveGraph()
  const node = graph.nodes.find(n => n.id === target.id)
  const group = graph.groups.find(g => g.id === target.id)
  const context = { position: target.position, targetId: target.id }
  const commands = uiCommands(editor, context)
  const button = (id: string, label?: string) => {
    const command = commands.find(item => item.id === id)
    return command && <button key={id} role="menuitem" disabled={!command.enabled} onClick={() => { close(); runUiCommand(editor, id, context) }}>{label ?? command.title}</button>
  }
  return <div ref={ref} role="menu" aria-label="Контекстное меню" className="context-menu" style={{ left: Math.min(target.x, window.innerWidth - 250), top: Math.min(target.y, window.innerHeight - 410) }} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []); const i = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus() }
  }}>
    {target.kind === 'canvas' ? <>
      {button('palette')}{button('paste')}{button('all')}{button('fit')}
    </> : target.kind === 'edge' && target.id ? <>
      {button('edit-target', 'Редактировать контракт')}
      {['flow', 'data', 'tool-access', 'reference'].map(kind => button('edge-' + kind))}
      {button('reverse-edge')}{button('delete', 'Удалить связь')}
    </> : group ? <>
      {button('edit-target', 'Редактировать группу')}{button('collapse-group')}
      {button('convert-group')}{button('ungroup')}{button('duplicate')}{button('delete', 'Удалить группу с узлами')}
    </> : node ? <>
      {button('edit-target')}{button('copy')}{button('duplicate')}{button('group', 'Сгруппировать')}
      {node.type === 'concept' && engineeringTypes.map(type => button('convert-' + type))}
      {button('toggle-node')}{button('delete', 'Удалить')}
    </> : null}
  </div>
}
