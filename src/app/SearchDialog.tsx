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

import { useState } from 'react'
import { useStore } from 'zustand'
import { useEditor } from './context'
import { graphEntries } from '../domain/graphs'
import { Modal } from '../shared/Modal'

export function SearchDialog() {
  const editor = useEditor()
  const project = useStore(editor.projectStore, s => s.project)
  const [query, setQuery] = useState('')
  const results = graphEntries(project).flatMap(entry => [...entry.graph.nodes.map(n => ({ id: n.id, title: n.title, type: n.type, tags: n.tags.join(' '), graph: entry.title })), ...entry.graph.groups.map(g => ({ id: g.id, title: g.title, type: 'group', tags: g.description, graph: entry.title }))]).filter(item => `${item.title} ${item.type} ${item.tags} ${item.graph}`.toLowerCase().includes(query.toLowerCase()))
  return <Modal title="Поиск по проекту" close={() => editor.uiStore.setState({ search: false })}><input className="palette-input" autoFocus aria-label="Поиск узлов и тегов" value={query} onChange={e => setQuery(e.target.value)} /><div className="search-results">{results.map(item => <button key={item.id} onClick={() => { editor.uiStore.setState({ search: false }); editor.safely(() => editor.focusEntity(item.id)) }}><strong>{item.title || 'Без названия'}</strong><span>{item.type} · {item.graph}{item.tags ? ` · ${item.tags}` : ''}</span></button>)}</div>{!results.length && <p className="muted">Узлы и группы не найдены.</p>}</Modal>
}
