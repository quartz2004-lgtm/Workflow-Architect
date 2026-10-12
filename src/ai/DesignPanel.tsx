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

import { useId, useMemo, useState } from 'react'
import { useEditor } from '../app/context'
import type { Profile } from '../profiles/schema'
import { FieldHelp } from '../help/FieldHelp'
import type { Project } from '../domain/schema'
import { useAssistantTask } from './client'
import { designProposalSchema } from './assistant-schema'
import { prepareProposal } from './proposal'
import { TaskStatus } from './TaskStatus'

export function DesignPanel({ profileId, model }: { profileId: Profile['id']; model: string }) {
  const fieldId = useId()
  const editor = useEditor(), task = useAssistantTask(profileId)
  const [text, setText] = useState(''), [conversation, setConversation] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [base, setBase] = useState<{ project: Project; graphId: string | null } | null>(null), [grant, setGrant] = useState(false), [applied, setApplied] = useState(false), [error, setError] = useState('')
  const parsed = useMemo(() => task.task?.status === 'succeeded' ? designProposalSchema.safeParse(task.task.result) : null, [task.task])
  const proposal = parsed?.success ? parsed.data : null
  const { preview, problem } = useMemo(() => {
    if (!proposal?.nodes.length || !base) return { preview: null, problem: '' }
    try { return { preview: prepareProposal(proposal, base.project, base.graphId, model, grant), problem: '' } }
    catch (error) { return { preview: null, problem: error instanceof Error ? error.message : String(error) } }
  }, [proposal, base, model, grant])
  const send = () => {
    if (!text.trim()) return
    const project = editor.projectStore.getState().project, graphId = editor.navigationStore.getState().graphId, graph = editor.getActiveGraph()
    const history = [...conversation, ...(proposal ? [{ role: 'assistant' as const, content: JSON.stringify(proposal).slice(0, 12000) }] : []), { role: 'user' as const, content: text.trim() }].slice(-10)
    setBase({ project, graphId }); setConversation(history); setText(''); setGrant(false); setApplied(false); setError('')
    const graphSummary = JSON.stringify({ nodes: graph.nodes.map(node => ({ title: node.title, type: node.type, description: node.description.slice(0, 200) })), edges: graph.edges.map(edge => ({ source: graph.nodes.find(node => node.id === edge.sourceNode)?.title, target: graph.nodes.find(node => node.id === edge.targetNode)?.title, type: edge.type })) }).slice(0, 12000)
    void task.start({ mode: 'design', conversation: history, graphSummary })
  }
  const apply = () => {
    if (!base || !preview || applied) return
    if (editor.projectStore.getState().project !== base.project || editor.navigationStore.getState().graphId !== base.graphId) { setError('Проект изменился после запроса. Отправьте уточнение, чтобы подготовить предложение для актуального графа.'); return }
    try { editor.execute(preview.command); editor.select(preview.graph.nodes.map(node => node.id)); editor.canvasStore.setState({ action: 'fit-selection' }); setApplied(true) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
  }
  return <section className="ai-section" aria-label="Помощник проектирования">
    <div className="ai-intro"><span className="eyebrow">DESIGN ASSISTANT</span><h3>Опишите, что хотите построить</h3><p>Помощник уточнит задачу и предложит новые узлы. Вы увидите состав и связи до добавления на Canvas.</p></div>
    <div className="ai-conversation">{conversation.filter(item => item.role === 'user').map((item, index) => <p className="ai-message" key={index}><strong>Вы</strong><br />{item.content}</p>)}{proposal && <p className="ai-message"><strong>Помощник</strong><br />{proposal.message}</p>}</div>
    {proposal?.questions.map((question, index) => <p className="ai-question" key={index}>{index + 1}. {question}</p>)}
    <label className="field" htmlFor={fieldId}><span>Задача или уточнение <FieldHelp helpKey="ai.design" /></span><textarea id={fieldId} rows={4} maxLength={12000} value={text} disabled={task.busy} onChange={event => setText(event.target.value)} placeholder="Нужны автор и редактор статей: сначала черновик, затем проверка и Markdown-файл…" /></label>
    <button className="primary" disabled={task.busy || !text.trim()} onClick={send}>{conversation.length ? 'Отправить уточнение' : 'Предложить workflow'}</button>
    <TaskStatus controller={task} />
    {(error || problem) && <p className="field-error" role="alert">{error || problem}</p>}
    {preview && <section className="ai-proposal" aria-label="Предварительный просмотр предложения"><h4>Добавится {preview.graph.nodes.length} узлов · {preview.graph.edges.length} связей</h4>
      <div className="ai-node-grid">{preview.graph.nodes.map(node => <article className="ai-node-preview" data-type={node.type} key={node.id}><span className="eyebrow">{node.type}</span><strong>{node.title}</strong><p>{node.description}</p>{node.type === 'agent' && <details><summary>Инструкции агента</summary><p>{node.config.systemPrompt}</p></details>}</article>)}</div>
      <ul className="ai-edges">{preview.graph.edges.map(edge => <li key={edge.id}>{preview!.graph.nodes.find(node => node.id === edge.sourceNode)?.title} → {preview!.graph.nodes.find(node => node.id === edge.targetNode)?.title} <span className="muted">{edge.type}</span></li>)}</ul>
      {!!preview.grants.length && <div className="ai-grants"><label className="ai-check"><input type="checkbox" checked={grant} disabled={applied} onChange={event => setGrant(event.target.checked)} />Разрешить новым агентам эти встроенные инструменты</label><ul>{preview.grants.map(item => <li key={item}>{item}</li>)}</ul><p className="muted">Без разрешения граф добавится как черновик; Run потребует настроить доступ.</p></div>}
      <button className="primary" disabled={applied || task.busy} onClick={apply}>{applied ? 'Добавлено · можно отменить Ctrl+Z' : 'Добавить на Canvas'}</button>
      <p className="muted">Существующие узлы сохраняются. Новые Agent используют {model}, стандартные лимиты и $0 API. Проверьте Validate и Run перед использованием.</p>
    </section>}
  </section>
}
