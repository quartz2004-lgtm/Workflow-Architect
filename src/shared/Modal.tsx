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
