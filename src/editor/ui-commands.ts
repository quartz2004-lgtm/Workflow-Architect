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

import { engineeringTypes, nodeCatalog } from '../domain/catalog'
import type { NodeType, Position } from '../domain/schema'
import { addNode, canPaste, copy, deleteSelection, duplicate, groupSelection, paste, selectAll } from './actions'
import type { Editor } from './session'

export interface CommandContext { position?: Position; targetId?: string }
export interface UiCommand { id: string; title: string; subtitle: string; enabled: boolean; palette?: boolean; run: () => void }

/** Application actions shared by keyboard, palette and context menus. */
export function uiCommands(editor: Editor, context: CommandContext = {}): UiCommand[] {
  const graph = editor.getActiveGraph()
  const selection = editor.selectionStore.getState()
  const nodes = graph.nodes.filter(n => selection.nodeIds.includes(n.id))
  const groups = graph.groups.filter(g => selection.groupIds.includes(g.id))
  const hasNodes = nodes.length > 0 || groups.some(g => g.nodeIds.length > 0)
  const hasSelection = nodes.length + groups.length + selection.edgeIds.length > 0
  const concepts = nodes.filter(n => n.type === 'concept' && (!context.targetId || n.id === context.targetId))
  const node = graph.nodes.find(n => n.id === context.targetId)
  const group = graph.groups.find(g => g.id === context.targetId)
  const edge = graph.edges.find(e => e.id === context.targetId)
  const command = (id: string, title: string, run: () => void, enabled = true, subtitle = '', palette = true): UiCommand => ({ id, title, subtitle, enabled, palette, run })
  return [
    ...Object.entries(nodeCatalog).map(([type, item]) => command(`add-${type}`, `${item.icon} ${item.label}`, () => { addNode(editor, type as NodeType, context.position) }, true, item.description)),
    ...engineeringTypes.map(type => command(`convert-${type}`, `Convert → ${nodeCatalog[type].label}`, () => editor.execute({ type: 'batch', commands: concepts.map(n => ({ type: 'convert-node', id: n.id, target: type })) }), concepts.length > 0, `Выбранных Concept: ${concepts.length}`)),
    command('undo', 'Отменить', editor.undo, editor.historyStore.getState().past.length > 0, 'Ctrl/Cmd Z'),
    command('redo', 'Повторить', editor.redo, editor.historyStore.getState().future.length > 0, 'Ctrl/Cmd Shift Z'),
    command('group', 'Сгруппировать выделение', () => groupSelection(editor), nodes.length > 0, 'G'),
    command('duplicate', 'Дублировать', () => duplicate(editor), hasNodes, 'Ctrl/Cmd D'),
    command('copy', 'Копировать', () => copy(editor), hasNodes, 'Ctrl/Cmd C'),
    command('paste', 'Вставить', () => paste(editor, context.position), canPaste(editor), 'Ctrl/Cmd V'),
    command('all', 'Выделить всё', () => selectAll(editor), graph.nodes.length + graph.groups.length > 0, 'Ctrl/Cmd A'),
    command('delete', 'Удалить выделение', () => deleteSelection(editor), hasSelection, 'Delete'),
    command('deselect', 'Снять выделение', () => editor.select(), hasSelection, 'Escape', false),
    command('fit', 'Показать весь граф', () => editor.canvasStore.setState({ action: 'fit-project' }), true, 'F'),
    command('fit-selection', 'Показать выделение', () => editor.canvasStore.setState({ action: 'fit-selection' }), hasNodes, 'Shift F'),
    ...(['reset', 'zoom-in', 'zoom-out'] as const).map(action => command(action, action, () => editor.canvasStore.setState({ action }), true, '', false)),
    command('validate', 'Validate', () => editor.validationStore.setState({ open: true }), true, 'Проверка архитектуры'),
    command('export', 'Экспорт проекта', () => editor.exportStore.setState({ open: true, target: editor.projectStore.getState().project.settings.exportDefault ?? 'archive' }), true, 'ZIP / JSON / YAML / Markdown / Codex'),
    command('search', 'Найти узел', () => editor.uiStore.setState({ search: true }), true, 'Ctrl/Cmd F'),
    command('palette', 'Добавить узел…', () => editor.uiStore.setState({ palette: true, insertion: context.position ?? null }), true, 'Ctrl/Cmd K', false),
    command('projects', 'Открыть проекты', () => editor.uiStore.setState({ projects: true }), true, 'Создать / импортировать'),
    command('help', 'Горячие клавиши', () => editor.uiStore.setState({ help: true }), true, '? / F1'),
    command('edit-target', 'Редактировать', () => { if (node) editor.select([node.id]); else if (group) editor.select([], [], [group.id]); else if (edge) editor.select([], [edge.id]) }, Boolean(node || group || edge), '', false),
    command('toggle-node', node?.status === 'disabled' ? 'Включить' : 'Отключить', () => { if (node) editor.execute({ type: 'edit-node', id: node.id, changes: { status: node.status === 'disabled' ? 'draft' : 'disabled' } }) }, Boolean(node), '', false),
    command('collapse-group', group?.collapsed ? 'Развернуть' : 'Свернуть', () => { if (group) editor.execute({ type: 'edit-group', id: group.id, changes: { collapsed: !group.collapsed } }) }, Boolean(group), '', false),
    command('convert-group', 'Преобразовать в Subworkflow', () => { if (group) editor.execute({ type: 'convert-group', id: group.id }) }, Boolean(group), '', false),
    command('ungroup', 'Разгруппировать', () => { if (group) editor.execute({ type: 'ungroup', id: group.id }) }, Boolean(group), '', false),
    command('reverse-edge', 'Развернуть связь', () => { if (edge) editor.execute({ type: 'reverse-edge', id: edge.id }) }, Boolean(edge), '', false),
    ...(['flow', 'data', 'tool-access', 'reference'] as const).map(kind => command(`edge-${kind}`, `Тип: ${kind}`, () => { if (edge) editor.execute({ type: 'set-edge-type', id: edge.id, kind }) }, Boolean(edge), '', false)),
  ]
}

export function runUiCommand(editor: Editor, id: string, context?: CommandContext) {
  const command = uiCommands(editor, context).find(item => item.id === id)
  if (!command?.enabled) return false
  editor.safely(command.run)
  return true
}
