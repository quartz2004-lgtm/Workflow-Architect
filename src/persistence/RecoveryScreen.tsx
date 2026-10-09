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
