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

import { useEffect, useRef, type ReactNode } from 'react'

export function Modal({ title, close, children, wide = false, className = '' }: { title: string; close: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog = ref.current
    const active = document.activeElement
    if (active instanceof HTMLElement && !dialog?.contains(active)) returnFocus.current = active
    dialog?.showModal()
    return () => { dialog?.close(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); close() }}>
    <header><h2>{title}</h2><button aria-label="Закрыть диалог" onClick={close}>×</button></header>
    <div className="modal-body">{children}</div>
  </dialog>
}
