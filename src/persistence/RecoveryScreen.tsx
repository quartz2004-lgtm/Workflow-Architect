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

import { useMemo } from 'react'
import type { Project } from '../domain/schema'
import { recoverProject, type RecoveryReport } from './recovery'
import { RecoveryDetails } from './RecoveryDetails'

export function RecoveryScreen({ raw, error, open, blank }: { raw?: string; error: string; open: (project: Project, report: RecoveryReport) => void; blank: () => void }) {
  const report = useMemo(() => raw === undefined ? null : recoverProject(raw), [raw])
  return <main className="boot-screen recovery-screen"><span className="eyebrow">ВОССТАНОВЛЕНИЕ ПРОЕКТА</span><h1>Не удалось открыть проект</h1><p role="alert">{error}</p><p>Сохранённые данные не перезаписаны.</p>
    {report && <RecoveryDetails report={report} />}
    <div className="recovery-actions">{report?.project && <button className="primary" onClick={() => open(report.project!, report)}>Открыть восстановленную копию</button>}<button onClick={blank}>Новый пустой проект</button><button onClick={() => location.reload()}>Повторить загрузку</button></div>
  </main>
}
