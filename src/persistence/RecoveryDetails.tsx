import { downloadText } from '../shared/download'
import type { RecoveryReport } from './recovery'

export function RecoveryDetails({ report, focus }: { report: RecoveryReport; focus?: (id: string) => void }) {
  return <div className="recovery-details"><p>Исходный проект сохранён без изменений. Восстановленная копия получит новый ID. Проверьте заменённые поля и диагностику связей.</p>
    <button onClick={() => downloadText('project-recovery.json', report.raw)}>Скачать исходный JSON</button>
    <ul>{report.issues.map((issue, index) => <li key={index}><span className="recovery-path">{issue.path}</span><p>{issue.message}</p>{focus && issue.entityId && <button onClick={() => focus(issue.entityId!)}>Открыть элемент</button>}{issue.original !== undefined && <details><summary>Исходная запись</summary><pre tabIndex={0}>{JSON.stringify(issue.original, null, 2)}</pre></details>}</li>)}</ul>
  </div>
}
