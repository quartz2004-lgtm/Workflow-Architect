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

import { createStore } from 'zustand/vanilla'
import type { Project } from '../domain/schema'
import { articleBrief } from './article-example'
import type { EditorialKind } from '../editorial/task-form'

export interface RunDraft {
  entryId: string; input: string; task: string; audience: string; minimumWords: number
  previousArticle: string; resultKind: EditorialKind; items: number; advancedInput: boolean
  contractValues: Record<string, Record<string, string>>
}

export function initialRunDraft(project: Project): RunDraft {
  return { entryId: project.nodes.find(node => node.type === 'trigger' && node.status !== 'disabled')?.id ?? '',
    input: project.nodes.some(node => node.operation?.kind === 'agent') ? JSON.stringify(articleBrief, null, 2) : '{\n  "approved": true,\n  "text": "Workflow Architect"\n}',
    task: articleBrief.topic, audience: articleBrief.audience, minimumWords: 600, previousArticle: '', resultKind: 'article', items: 5,
    advancedInput: false, contractValues: {},
  }
}

/** Session-only drafts belong to one editor/profile. Never exported or added to graph history. */
export function createRunDraftStore() {
  return createStore(() => ({ drafts: {} as Record<string, RunDraft> }))
}

export function updateRunDraft(store: ReturnType<typeof createRunDraftStore>, project: Project, patch: Partial<RunDraft>) {
  store.setState(state => ({ drafts: { ...state.drafts, [project.project.id]: { ...(state.drafts[project.project.id] ?? initialRunDraft(project)), ...patch } } }))
}
