import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../app/context'
import { Modal } from '../shared/Modal'
import { downloadBlob } from '../shared/download'
import { chapters, searchChapters, type HelpBlock } from './content'
import { almanacHtml } from './html'
import './almanac.css'

function Block({ block }: { block: HelpBlock }) {
  if ('text' in block) {
    switch (block.kind) {
      case 'heading': return <h4>{block.text}</h4>
      case 'note': return <aside className="almanac-note">{block.text}</aside>
      case 'code': return <pre><code>{block.text}</code></pre>
      default: return <p>{block.text}</p>
    }
  }
  if (block.kind === 'table') return <div className="almanac-table"><table><thead><tr>{block.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
  const Tag = block.kind === 'steps' ? 'ol' : 'ul'
  return <Tag>{block.items.map(item => <li key={item}>{item}</li>)}</Tag>
}

export function Almanac() {
  const editor = useEditor()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('purpose')
  const results = searchChapters(query)
  const chapter = results.find(chapter => chapter.id === selected) ?? results[0]
  const index = chapters.findIndex(item => item.id === chapter?.id)
  const article = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { article.current?.scrollTo({ top: 0 }) }, [chapter?.id])
  const open = (id: string, clear = false) => {
    if (clear) setQuery('')
    setSelected(id)
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
  }
  return <Modal wide className="almanac-modal" title="Альманах Workflow Architect" close={() => editor.uiStore.setState({ help: false })}>
    <div className="almanac-toolbar"><div><span className="eyebrow">РУКОВОДСТВО ПО ПРИЛОЖЕНИЮ</span><p>От замысла до инженерной спецификации</p></div><button onClick={() => downloadBlob('Workflow-Architect-Almanac-0.1.html', new Blob([almanacHtml(chapters)], { type: 'text/html;charset=utf-8' }))}>Сохранить альманах <span aria-hidden="true">↗</span></button></div>
    <div className="almanac-layout"><aside className="almanac-sidebar"><label className="almanac-search"><span>Поиск по альманаху</span><input type="search" placeholder="Контракты, Agent, экспорт…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="almanac-count" role="status">{query.trim() ? `Найдено глав: ${results.length}` : `${chapters.length} глав · Alpha 0.1`}</div>
      <nav aria-label="Оглавление альманаха">{results.map((item, i) => <div key={item.id}>{results[i - 1]?.group !== item.group && <div className="almanac-group">{item.group}</div>}<button aria-current={chapter?.id === item.id ? 'page' : undefined} onClick={() => open(item.id)}><span>{String(chapters.indexOf(item) + 1).padStart(2, '0')}</span>{item.title}</button></div>)}</nav>
    </aside>
      {chapter ? <article key={chapter.id} ref={article} className="almanac-article" aria-labelledby="almanac-chapter"><div className="almanac-chapter-meta">{chapter.group} <span>ГЛАВА {String(index + 1).padStart(2, '0')}</span></div><h3 ref={heading} tabIndex={-1} id="almanac-chapter">{chapter.title}</h3><p className="almanac-summary">{chapter.summary}</p>{chapter.blocks.map((block, i) => <Block key={i} block={block} />)}
        <footer className="almanac-pagination"><button disabled={index <= 0} onClick={() => { const previous = chapters[index - 1]; if (previous) open(previous.id, true) }}>← Предыдущая глава</button><span>{index + 1} / {chapters.length}</span><button disabled={index >= chapters.length - 1} onClick={() => { const next = chapters[index + 1]; if (next) open(next.id, true) }}>Следующая глава →</button></footer>
      </article> : <div className="almanac-empty"><span className="eyebrow">ПОИСК ПО СПРАВОЧНИКУ</span><h3>Главы не найдены</h3><p>Попробуйте «сохранение», «контракт» или название узла. Поиск проверяет заголовки и полный текст глав.</p><button onClick={() => setQuery('')}>Сбросить поиск</button></div>}
    </div>
  </Modal>
}
