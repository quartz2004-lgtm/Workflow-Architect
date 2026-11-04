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

import { useEffect, useId, useState } from 'react'

/** Visual guidance only: native controls retain pointer and keyboard interaction. */
export function PracticeSpotlight({ target }: { target: string }) {
  const id = useId().replaceAll(':', '')
  const [areas, setAreas] = useState<{ x: number; y: number; width: number; height: number }[]>([])
  useEffect(() => {
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const focus = target === 'run' ? document.querySelector('.run-panel') ?? document.querySelector('[data-tour="run"]') : document.querySelector(`[data-tour="${target}"]`)
        const rects = [document.querySelector('.practice-coach'), focus].flatMap(element => {
          const r = element?.getBoundingClientRect()
          return r && r.width > 0 && r.height > 0 ? [{ x: r.x, y: r.y, width: r.width, height: r.height }] : []
        })
        setAreas(previous => JSON.stringify(previous) === JSON.stringify(rects) ? previous : rects)
      })
    }
    const observer = new ResizeObserver(measure)
    for (const element of document.querySelectorAll('.app-shell, .practice-coach, [data-tour]')) observer.observe(element)
    const mutation = new MutationObserver(measure)
    mutation.observe(document.querySelector('.app-shell') ?? document.body, { childList: true, subtree: true })
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true); measure()
    return () => { observer.disconnect(); mutation.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [target])
  const focus = areas[1], coach = areas[0]
  return <svg className="practice-spotlight" aria-hidden="true"><defs><mask id={`practice-${id}`}><rect width="100%" height="100%" fill="white" />{areas.map((r, i) => <rect key={i} {...r} fill="black" rx="6" />)}</mask><marker id={`practice-arrow-${id}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L7 4 L0 8" className="tour-arrow" /></marker></defs><rect width="100%" height="100%" fill="black" opacity=".34" mask={`url(#practice-${id})`} />{focus && <rect {...focus} rx="6" className="tour-highlight" />}{focus && coach && focus.y >= coach.y + coach.height && <path className="tour-arrow" d={`M ${focus.x + focus.width / 2} ${coach.y + coach.height + 2} L ${focus.x + focus.width / 2} ${focus.y + 12}`} markerEnd={`url(#practice-arrow-${id})`} />}</svg>
}
