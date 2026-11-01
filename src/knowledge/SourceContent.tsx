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

import type { ReactNode } from 'react'
import './source-content.css'

const labels: Record<string, string> = {
  sourceContext: 'Условия источника', record: 'Сведения', snapshot_date: 'Дата снимка', note: 'Примечание',
  precedence: 'Приоритет сведений', canonical_sku: 'Код товара в базе', article: 'Артикул', name: 'Название',
  category: 'Категория', sizes: 'Размеры', colors: 'Цвета', composition_as_in_catalog: 'Состав по каталогу',
  features_as_in_catalog: 'Особенности по каталогу', benefit_as_in_catalog: 'Польза по каталогу',
  availability: 'Наличие', source_version: 'Версия источника', source_refs: 'Ссылки на источники',
  source_id: 'Источник', source_row: 'Строка источника', source_refs_note: 'Пояснение к источникам',
  commercial_prices_path: 'Источник цен', care_profile_ids: 'Связанные правила ухода', care_rules_path: 'Источник ухода',
  id: 'Идентификатор', text: 'Текст', rules: 'Правила', scope: 'Область применения', status: 'Статус',
  received_date: 'Дата получения', verification: 'Проверка источника', version: 'Версия',
  not_shown: 'Не указано в таблице', code: 'Обозначение', legend_cell: 'Ячейка легенды',
  symbol_sha256: 'Контрольная сумма символа', sheet: 'Лист', rows: 'Строки',
}
function renderValue(value: unknown, depth = 0): ReactNode {
  if (value === null) return <span>Не указано (null)</span>
  if (typeof value !== 'object') return <span>{String(value)}</span>
  if (depth >= 8) return <pre>{JSON.stringify(value, null, 2)}</pre>
  if (Array.isArray(value)) return value.length
    ? <ul>{value.map((item, index) => <li key={index}>{renderValue(item, depth + 1)}</li>)}</ul>
    : <span>Пустой список</span>
  const entries = Object.entries(value)
  return entries.length ? <dl>{entries.map(([key, item]) => <div key={key}>
    <dt>{Object.hasOwn(labels, key) ? labels[key] : key}</dt><dd>{renderValue(item, depth + 1)}</dd>
  </div>)}</dl> : <span>Нет полей</span>
}

/** Lossless display only: does not summarize, infer facts or execute source markup. */
export function SourceContent({ content }: { content: string }) {
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { return <pre className="source-content">{content}</pre> }
  return <div className="source-content">{renderValue(parsed)}
    <details><summary>Точный исходный фрагмент</summary><pre>{content}</pre></details>
  </div>
}
