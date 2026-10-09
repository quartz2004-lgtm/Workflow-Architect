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

import { downloadText } from '../shared/download'
import type { RecoveryReport } from './recovery'

export function RecoveryDetails({ report, focus }: { report: RecoveryReport; focus?: (id: string) => void }) {
  return <div className="recovery-details"><p>Исходный проект сохранён без изменений. Восстановленная копия получит новый ID. Проверьте заменённые поля и диагностику связей.</p>
    <button onClick={() => downloadText('project-recovery.json', report.raw)}>Скачать исходный JSON</button>
    <ul>{report.issues.map((issue, index) => <li key={index}><span className="recovery-path">{issue.path}</span><p>{issue.message}</p>{focus && issue.entityId && <button onClick={() => focus(issue.entityId!)}>Открыть элемент</button>}{issue.original !== undefined && <details><summary>Исходная запись</summary><pre tabIndex={0}>{JSON.stringify(issue.original, null, 2)}</pre></details>}</li>)}</ul>
  </div>
}
