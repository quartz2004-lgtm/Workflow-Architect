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

import { useEffect, useRef, useState } from 'react'
import { aiCommandSchema, assistantTaskSchema, type AiCommand, type AssistantTask } from './protocol'
import type { AssistantInput } from './assistant-schema'
import type { Profile } from '../profiles/schema'

export async function aiRequest(command: AiCommand): Promise<unknown> {
  const bridge = window.workflowDesktop?.runtime
  if (!bridge) throw new Error('ИИ доступен в Windows-приложении. Ручной редактор работает без подключения модели.')
  return bridge.request({ kind: 'ai', command: aiCommandSchema.parse(command) })
}
export function useAssistantTask(profileId: Profile['id']) {
  const [task, setTask] = useState<AssistantTask | null>(null), [error, setError] = useState(''), [starting, setStarting] = useState(false)
  const current = useRef<AssistantTask | null>(null), mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    let fetching = false
    const timer = setInterval(() => {
      const saved = current.current
      if (!saved || saved.status !== 'running' || fetching) return
      fetching = true
      void aiRequest({ action: 'get', profileId, id: saved.id }).then(value => {
        if (!mounted.current || current.current?.id !== saved.id) return
        const result = assistantTaskSchema.parse(value); current.current = result; setTask(result)
      }).catch(error => { if (mounted.current) setError(error instanceof Error ? error.message : String(error)) }).finally(() => { fetching = false })
    }, 600)
    return () => { mounted.current = false; clearInterval(timer); const saved = current.current; if (saved?.status === 'running') void aiRequest({ action: 'cancel', profileId, id: saved.id }).catch(() => {}) }
  }, [profileId])
  const start = async (input: AssistantInput) => {
    if (starting || current.current?.status === 'running') return
    setStarting(true); setError(''); setTask(null); current.current = null
    try {
      const result = assistantTaskSchema.parse(await aiRequest({ action: 'start', profileId, input }))
      if (!mounted.current) { if (result.status === 'running') await aiRequest({ action: 'cancel', profileId, id: result.id }); return }
      current.current = result; setTask(result)
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (mounted.current) setStarting(false) }
  }
  const cancel = async () => {
    const saved = current.current
    if (!saved) return
    try { const result = assistantTaskSchema.parse(await aiRequest({ action: 'cancel', profileId, id: saved.id })); if (mounted.current && current.current?.id === saved.id) { current.current = result; setTask(result) } }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : String(error)) }
  }
  return { task, error, busy: starting || task?.status === 'running', start, cancel }
}
