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

import { useEffect, useState } from 'react'
import { Modal } from '../shared/Modal'
import { useProfile } from '../profiles/context'
import { ConnectionPanel } from './ConnectionPanel'
import { DesignPanel } from './DesignPanel'
import { PersonalizationPanel } from './PersonalizationPanel'
import { aiRequest } from './client'
import { connectionStateSchema } from './protocol'
import './ai.css'

export function AiWorkbench({ close }: { close: () => void }) {
  const profile = useProfile()!.profile
  const [tab, setTab] = useState<'connection' | 'design' | 'personal'>('connection'), [model, setModel] = useState('qwen3:8b')
  useEffect(() => { let active = true; if (window.workflowDesktop?.runtime) void aiRequest({ action: 'state', profileId: profile.id }).then(value => { const parsed = connectionStateSchema.parse(value); if (active && parsed.connection) setModel(parsed.connection.configuration.model) }).catch(() => {}); return () => { active = false } }, [profile.id])
  return <Modal wide className="ai-workbench" title={`ИИ · ${profile.name}`} close={close}>
    {!window.workflowDesktop?.runtime ? <div className="ai-intro"><h3>Локальный ИИ — в Windows-приложении</h3><p>Windows-runtime подключается к Ollama на вашем компьютере. В браузере остаются доступны проектирование, экспорт и не-ИИ операции.</p></div> : <>
      <nav className="ai-tabs" aria-label="Разделы ИИ-помощника">{([{ id: 'connection', title: '01 · Подключение' }, { id: 'design', title: '02 · Проектирование' }, { id: 'personal', title: '03 · Для меня' }] as const).map(item => <button key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.title}</button>)}</nav>
      {tab === 'connection' && <ConnectionPanel profileId={profile.id} changed={setModel} />}
      {tab === 'design' && <DesignPanel profileId={profile.id} model={model} />}
      {tab === 'personal' && <PersonalizationPanel />}
    </>}
  </Modal>
}
