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

const Dialog = lazy(() => import('./IntegrationsDialog').then(module => ({ default: module.IntegrationsDialog })))
export function IntegrationsMenu() {
  const [open, setOpen] = useState(false), profile = useProfile()
  if (!profile) return null
  return <><button onClick={() => setOpen(true)}>Интеграции</button>{open && createPortal(<Suspense fallback={<div role="status">Открываем подключения…</div>}><Dialog key={profile.profile.id} close={() => setOpen(false)} /></Suspense>, document.body)}</>
}
