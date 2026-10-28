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

import type { EditorialState } from './engine-schema'
import { countWords } from '../ai/agent'
import { downloadText } from '../shared/download'

const phases: Record<EditorialState['phase'], string> = {
  planner: 'Готовим замысел', writer: 'Пишем текст', reviewer: 'Проверяем текст',
  'awaiting-human': 'Текст проверен программой и моделью · решение за вами',
  'needs-editing': 'Требуется редактура', interrupted: 'Этап прерван · результат запроса неизвестен', cancelled: 'Редакция отменена',
}
export function EditorialRunView({ state, decision }: { state: EditorialState; decision?: 'approved' | 'rejected' | 'waiting' }) {
  const readyLabel = decision === 'approved' ? 'Вы подтвердили эту версию' : decision === 'rejected' ? 'Вы отклонили эту версию' : decision === 'waiting' ? 'ожидает вашего решения' : 'подтверждение не получено'
  return <section className="run-editorial" aria-label="Редакционный процесс">
    <h3>{state.phase === 'awaiting-human' && decision !== 'waiting' ? readyLabel : phases[state.phase]}</h3>
    <p className="muted">Замысел → текст → проверка → ваше подтверждение. Локально, без облачного ИИ.</p>
    <p>{state.versions.length} из {state.budget.maxRevisions} версий · {state.spentTokens.toLocaleString('ru')} токенов из {state.budget.maxTotalTokens.toLocaleString('ru')}</p>
    {!!state.issues.length && <ul>{state.issues.map((issue, index) => <li key={index}>{issue.origin === 'reviewer' ? 'Замечание модели' : 'Проверка программы'}: {issue.message}</li>)}</ul>}
    {state.plan && <details><summary>Редакционный замысел</summary><pre>{state.plan}</pre></details>}
    {state.versions.map(version => <details key={version.id}>
      <summary>Версия {version.number} · {countWords(version.text)} слов · {version.issues.length ? 'есть замечания' : state.phase === 'awaiting-human' && version.id === state.versions.at(-1)?.id ? readyLabel : 'черновик · проверка ещё не завершена'}</summary>
      <pre>{version.text}</pre>
      {!!version.issues.length && <ul>{version.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
      <p className="muted">Это сохранённый черновик. Проверка программы и модели не заменяет ваше решение.</p>
      <button onClick={() => downloadText(`draft-v${version.number}-${version.id.slice(0, 8)}.md`, version.text)}>Сохранить черновик версии {version.number}</button>
      <details><summary>Идентификатор и контрольная сумма</summary><pre>{version.id}{'\n'}SHA256 {version.digest}</pre></details>
    </details>)}
  </section>
}
