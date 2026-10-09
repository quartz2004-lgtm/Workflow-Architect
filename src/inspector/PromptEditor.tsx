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
