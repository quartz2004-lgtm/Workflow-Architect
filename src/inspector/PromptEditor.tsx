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

import { lazy, Suspense, useState } from 'react'
import { useEditor } from '../app/context'
import { createId } from '../domain/factories'
import { Modal } from '../shared/Modal'
import { downloadText } from '../shared/download'
import { TextField } from './controls'

const MarkdownEditor = lazy(() => import('./MarkdownEditor'))
export function PromptEditor({ value, commit, title }: { value: string; commit: (text: string) => void; title: string }) {
  const editor = useEditor()
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(value)
  return <div className="prompt-editor"><TextField key={value} label="System prompt" helpKey="agent.systemPrompt" value={value} multiline commit={commit} />
    <div className="inline-actions"><button onClick={() => { setDraft(value); setExpanded(true) }}>Развернуть prompt</button><button onClick={() => downloadText('prompt.md', value)}>Скачать .md</button></div>
    <button className="text-button" onClick={() => editor.safely(() => editor.execute({ type: 'save-prompt', prompt: { id: createId(), name: `${title} — prompt`, content: value } }))}>＋ Сохранить в общие prompts</button>
    {expanded && <Modal wide title="System prompt · Markdown" close={() => setExpanded(false)}><Suspense fallback={<p>Загрузка редактора…</p>}><MarkdownEditor value={draft} onChange={setDraft} /></Suspense><div className="dialog-actions"><button onClick={() => setExpanded(false)}>Отмена</button><button className="primary" onClick={() => { commit(draft); setExpanded(false) }}>Применить prompt</button></div></Modal>}
  </div>
}
