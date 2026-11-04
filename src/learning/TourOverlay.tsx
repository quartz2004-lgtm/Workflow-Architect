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

import { useEffect, useId, useRef, useState } from 'react'
import type { TourStep } from './tours'

interface Rect { x: number; y: number; width: number; height: number }
export function TourOverlay({ title, steps, index, move, close, finish }: {
  title: string; steps: TourStep[]; index: number; move: (index: number) => void; close: () => void; finish: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), card = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const id = useId().replaceAll(':', ''), step = steps[index]!
  const [layout, setLayout] = useState<{ rect: Rect | null; left: number; top: number; width: number }>({ rect: null, left: 16, top: 16, width: 360 })
  useEffect(() => {
    const active = document.activeElement, element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      const target = active instanceof HTMLElement && active.isConnected ? active : document.querySelector<HTMLElement>('[data-learning-open]')
      target?.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => {
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
        const r = target?.getBoundingClientRect()
        const rect = r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
          ? { x: Math.max(4, r.left - 6), y: Math.max(4, r.top - 6), width: Math.min(innerWidth - 8, r.width + 12), height: Math.min(innerHeight - 8, r.height + 12) } : null
        if (rect) { rect.width = Math.min(rect.width, innerWidth - rect.x - 4); rect.height = Math.min(rect.height, innerHeight - rect.y - 4) }
        const width = Math.min(390, innerWidth - 32), height = card.current?.offsetHeight ?? 310
        const sideLeft = rect && rect.height > innerHeight / 2 && rect.x >= width + 38 ? rect.x - width - 22 : null
        const sideRight = rect && rect.height > innerHeight / 2 && rect.x + rect.width + width + 38 <= innerWidth ? rect.x + rect.width + 22 : null
        const left = sideLeft ?? sideRight ?? Math.max(16, Math.min(rect ? rect.x : (innerWidth - width) / 2, innerWidth - width - 16))
        const below = rect ? rect.y + rect.height + 22 : 32
        const above = rect ? rect.y - height - 22 : 32
        const top = Math.max(16, Math.min(sideLeft !== null || sideRight !== null ? rect!.y : below + height <= innerHeight - 16 ? below : above >= 16 ? above : innerHeight - height - 16, innerHeight - height - 16))
        const next = { rect, left, top, width }
        setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      })
    }
    const observer = new ResizeObserver(measure)
    if (card.current) observer.observe(card.current)
    const target = document.querySelector(`[data-tour="${step.target}"]`)
    if (target) observer.observe(target)
    const mutations = new MutationObserver(measure)
    mutations.observe(document.querySelector('.app-shell') ?? document.body, { childList: true, subtree: true })
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true)
    measure(); heading.current?.focus({ preventScroll: true })
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [step.target, index])
  const r = layout.rect
  const arrowX = r ? Math.max(r.x + 8, Math.min(layout.left + layout.width / 2, r.x + r.width - 8)) : 0
  const below = r ? layout.top >= r.y + r.height : false
  return <dialog ref={dialog} className="tour-overlay" aria-label={`Обучение: ${title}`} onCancel={event => { event.preventDefault(); close() }}>
    <svg className="tour-shade" aria-hidden="true" width="100%" height="100%">
      <defs><mask id={`shade-${id}`}><rect width="100%" height="100%" fill="white" />{r && <rect x={r.x} y={r.y} width={r.width} height={r.height} rx="10" fill="black" />}</mask><marker id={`arrow-${id}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L7 4 L0 8" fill="none" className="tour-arrow" /></marker></defs>
      <rect width="100%" height="100%" className="tour-dim" mask={`url(#shade-${id})`} />
      {r && <><rect className="tour-highlight" x={r.x} y={r.y} width={r.width} height={r.height} rx="10" />
        {layout.left + layout.width < r.x && <path className="tour-arrow" d={`M ${layout.left + layout.width + 2} ${layout.top + 30} L ${r.x - 5} ${layout.top + 30}`} markerEnd={`url(#arrow-${id})`} />}
        {layout.left > r.x + r.width && <path className="tour-arrow" d={`M ${layout.left - 2} ${layout.top + 30} L ${r.x + r.width + 5} ${layout.top + 30}`} markerEnd={`url(#arrow-${id})`} />}
        {(below || layout.top + (card.current?.offsetHeight ?? 310) < r.y) && <path className="tour-arrow" d={`M ${layout.left + layout.width / 2} ${below ? layout.top - 2 : layout.top + (card.current?.offsetHeight ?? 310) + 2} L ${arrowX} ${below ? r.y + r.height + 5 : r.y - 5}`} markerEnd={`url(#arrow-${id})`} />}</>}
    </svg>
    <div ref={card} className="tour-card" style={{ left: layout.left, top: layout.top, width: layout.width }}>
      <div className="tour-meta"><span>{title}</span><span aria-label="Прогресс обучения">{index + 1} / {steps.length}</span></div>
      <progress value={index + 1} max={steps.length} aria-label="Пройденные шаги" />
      <h2 ref={heading} tabIndex={-1}>{step.title}</h2><p>{step.text}</p>
      {!r && <p role="status" className="muted">Область сейчас скрыта. Можно продолжить обзор или завершить его и открыть нужный раздел.</p>}
      <p className="tour-caption">Это обзор. Действия и запуск задач остаются за вами.</p>
      <div className="tour-actions"><button disabled={index === 0} onClick={() => move(index - 1)}>Назад</button><button className="primary" onClick={() => index + 1 === steps.length ? finish() : move(index + 1)}>{index + 1 === steps.length ? 'Завершить обзор' : 'Далее'}</button></div>
      <button className="tour-later" onClick={close}>Завершить позже</button>
    </div>
  </dialog>
}
