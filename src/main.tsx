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

import { createProfileRepository } from './profiles/repository'
import { profileIds, type Profile } from './profiles/schema'
import { ProfileProvider } from './profiles/context'
import { Setup } from './profiles/Setup'
import './profiles/profiles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createProject } from './domain/factories'
import { openStoredProject } from './persistence/open-project'
import { createEditor } from './editor/session'
import { startAutosave } from './persistence/autosave'
import { createRepository } from './persistence/repository'
import type { Project } from './domain/schema'
import type { RecoveryReport } from './persistence/recovery'
import { RecoveryScreen } from './persistence/RecoveryScreen'
import { attachDesktopAutosave } from './platform/desktop'
import './design-system/tokens.css'
import './design-system/app.css'

const element = document.getElementById('root')
if (!element) throw new Error('Root element is missing')
const root = createRoot(element)
root.render(<div className="boot-screen" role="status">Открываем рабочее пространство…</div>)
const profiles = createProfileRepository()
async function boot(profile: Profile) {
  let raw: string | undefined
  const repository = createRepository('workflow-architect', { id: profile.id, adoptLegacy: profile.id === profileIds[0] })
  const launch = (project: Project, report: RecoveryReport | null = null) => {
    const editor = createEditor(project)
    editor.recoveryStore.setState({ report })
    const autosave = startAutosave(editor, repository)
    attachDesktopAutosave(autosave)
    if (import.meta.hot) import.meta.hot.dispose(() => autosave.stop())
    root.render(<StrictMode><ProfileProvider initial={profile} repository={profiles}><App editor={editor} autosave={autosave} repository={repository} /></ProfileProvider></StrictMode>)
  }
  try {
    raw = await repository.loadActive()
    const project = raw === undefined ? createProject() : await openStoredProject(raw)
    if (raw === undefined) project.settings.defaultMode = profile.preferences.defaultMode
    launch(project)
  } catch (error) {
    root.render(<RecoveryScreen raw={raw} error={error instanceof Error ? error.message : 'Хранилище недоступно.'} open={launch} blank={() => launch(createProject())} />)
  }
}
async function start() {
  try {
    await profiles.initialize()
    const profile = await profiles.loadActive()
    if (profile.onboarding === 'new') root.render(<Setup initial={profile} complete={async next => { await boot(await profiles.save(next)) }} />)
    else await boot(profile)
  } catch (error) {
    root.render(<div className="profile-setup" role="alert"><h1>Не удалось открыть настройки профиля</h1><p>{error instanceof Error ? error.message : String(error)}</p><p>Исходные настройки и проекты сохранены без изменений.</p><button onClick={() => { void start() }}>Повторить открытие</button></div>)
  }
}
void start()
