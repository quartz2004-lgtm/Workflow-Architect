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

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../app/context'
import { fieldHelp, type FieldHelpKey } from './field-help'
import './field-help.css'

export function FieldHelp({ helpKey, label }: { helpKey: FieldHelpKey; label?: string }) {
  const editor = useEditor()
  const help = fieldHelp[helpKey]
  const id = useId()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = () => clearTimeout(timer.current)
  const show = () => { cancel(); setOpen(true) }
  const leave = () => { cancel(); timer.current = setTimeout(() => {
    if (document.activeElement !== button.current && !panel.current?.contains(document.activeElement)) setOpen(false)
  }, 160) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useLayoutEffect(() => {
    const element = panel.current
    if (!open || !element) return
    element.showPopover()
    const position = () => {
      const anchor = button.current?.getBoundingClientRect()
      if (!anchor) return
      const rect = element.getBoundingClientRect()
      element.style.left = `${Math.max(12, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 12))}px`
      const below = anchor.bottom + 8
      const top = below + rect.height <= window.innerHeight - 12 ? below : anchor.top - rect.height - 8
      element.style.top = `${Math.max(12, top)}px`
    }
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); button.current?.focus(); setOpen(false) }
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    window.addEventListener('keydown', dismiss, true)
    return () => {
      element.hidePopover()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('keydown', dismiss, true)
    }
  }, [open])
  return <span className="field-help" onMouseEnter={show} onMouseLeave={leave} onFocus={show} onBlur={leave}>
    <button type="button" ref={button} className="field-help-trigger" aria-label={`Справка: ${label ?? help.label}`} aria-expanded={open} aria-controls={id} aria-describedby={open ? `${id}-text` : undefined} onClick={show}>?</button>
    {open && <div id={id} ref={panel} popover="manual" className="field-help-panel" role="region" aria-label={`Подсказка: ${label ?? help.label}`} onMouseEnter={cancel} onMouseLeave={leave}>
      <strong>{label ?? help.label}</strong><p id={`${id}-text`}>{help.text}</p>
      <button type="button" onClick={() => { button.current?.focus(); setOpen(false); editor.uiStore.setState({ help: true, helpChapter: help.chapter }) }}>Подробнее в альманахе <span aria-hidden="true">↗</span></button>
    </div>}
  </span>
}

export function FieldHeading({ label, htmlFor, helpKey }: { label: string; htmlFor?: string; helpKey?: FieldHelpKey }) {
  return <span className="field-heading">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}{helpKey && <FieldHelp helpKey={helpKey} label={label} />}</span>
}
