import { useEffect } from 'react'
import { useStore } from 'zustand'
import { useEditor } from '../app/context'

export function PreviewPanel() {
  const editor = useEditor()
  const state = useStore(editor.preview.store)
  const current = state.steps[state.index]
  useEffect(() => { if (current && current.graphId !== editor.navigationStore.getState().graphId) editor.navigate(current.graphId) }, [current, editor])
  const labels = { idle: 'Готов к просмотру', running: 'Обход графа', paused: 'Пауза', complete: 'Обход завершён', blocked: 'Ошибка структуры' }
  return <section className="preview-panel" aria-label="Архитектурный Preview"><div className="preview-heading"><strong>Preview · {labels[state.status]}</strong><span>{current ? `${state.index + 1} / ${state.steps.length} · ${current.title}` : state.message}</span><button aria-label="Закрыть Preview" onClick={editor.preview.stop}>×</button></div>
    <div className="preview-actions"><p>Обход архитектуры без AI-запросов. Каждый узел — один раз; условия ветвей не вычисляются.{current?.branch && <strong> Показаны все ветви.</strong>}</p>{state.status === 'running' && <button onClick={editor.preview.pause}>Пауза</button>}{state.status === 'paused' && <button onClick={editor.preview.resume}>Продолжить</button>}<button disabled={!current || ['complete', 'blocked'].includes(state.status)} onClick={editor.preview.step}>Следующий шаг</button>{current && <button onClick={() => editor.focusEntity(current.nodeId)}>Показать узел</button>}{state.status === 'blocked' && <button onClick={() => editor.validationStore.setState({ open: true })}>Открыть диагностику</button>}</div>
  </section>
}
