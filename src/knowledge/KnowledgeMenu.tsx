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
import { createPortal } from 'react-dom'
import { useProfile } from '../profiles/context'
const Dialog = lazy(() => import('./KnowledgeDialog').then(module => ({ default: module.KnowledgeDialog })))
export function KnowledgeMenu() {
  const [open, setOpen] = useState(false), session = useProfile()
  if (!session) return null
  return <><button onClick={() => setOpen(true)}>Знания SOAR</button>{open && createPortal(<Suspense fallback={<div role="status" className="dialog-loading">Открываем знания…</div>}><Dialog key={session.profile.id} profileId={session.profile.id} profileName={session.profile.name} close={() => setOpen(false)} /></Suspense>, document.body)}</>
}
