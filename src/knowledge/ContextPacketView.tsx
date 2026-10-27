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

import type { ContextPacket } from './context'
import './context.css'

export function ContextPacketView({ packet }: { packet: ContextPacket }) {
  return <section className="knowledge-context" aria-label="Источники в контексте агента">
    {packet.handoff && <details><summary>Задание и требования к результату</summary><p>Локально · {packet.handoff.model} · минимум {packet.handoff.minimumWords} слов · {packet.handoff.format}</p><pre>{packet.task}</pre><pre>{packet.handoff.instructions}</pre><p>{packet.handoff.editorialFreedom}</p>{packet.handoff.outputContract !== undefined && <pre>{JSON.stringify(packet.handoff.outputContract, null, 2)}</pre>}</details>}
    {packet.stageInput !== undefined && <details><summary>Вход этого этапа / черновик</summary><pre>{typeof packet.stageInput === 'string' ? packet.stageInput : JSON.stringify(packet.stageInput, null, 2)}</pre></details>}
    {!!packet.images?.length && <div className="knowledge-image-grid">{packet.images.map((item, index) => <figure key={item.id}><img src={`data:image/png;base64,${item.image.data}`} width={item.image.width} height={item.image.height} alt={item.label} /><figcaption>Фото {index + 1}: {item.label} · SKU {item.sku}<details><summary>Происхождение фото</summary><pre>{JSON.stringify({ id: item.id, hash: item.hash, sourceName: item.sourceName, sourceHash: item.sourceHash, width: item.image.width, height: item.image.height }, null, 2)}</pre></details></figcaption></figure>)}</div>}
    <p className="muted">Выдержки: {packet.excerpts.length} · бюджет {packet.budgetBytes.toLocaleString('ru')} байт{packet.sku ? ` · SKU ${packet.sku}` : ''}</p>
    <p className="muted">Это подборка для задания, а не вся база. Точные артикулы из каталога имеют приоритет; сведения о выбранных товарах и связанные правила сохраняются целиком.</p>
    {!!packet.gaps.length && <div role="status"><strong>Контекст неполон</strong><ul>{packet.gaps.map((gap, index) => <li key={index}>{gap.kind === 'missing-sku' ? 'Текстовые сведения о SKU не найдены: ' : gap.kind === 'missing-source' ? 'Источник не найден: ' : ''}{gap.detail}</li>)}</ul></div>}
    {packet.excerpts.map(excerpt => <details key={`${excerpt.collectionId}:${excerpt.documentId}:${excerpt.locator}`}>
      <summary>{excerpt.path} · {excerpt.locator}</summary>
      <p className="muted">Версия {excerpt.sourceVersion}{excerpt.skus.length ? ` · SKU ${excerpt.skus.join(', ')}` : ''}</p>
      <pre>{excerpt.content}</pre>
      <details><summary>Происхождение и контрольные суммы</summary><pre>{JSON.stringify({ collectionId: excerpt.collectionId, snapshotId: excerpt.snapshotId, snapshotDigest: excerpt.snapshotDigest, documentId: excerpt.documentId, documentHash: excerpt.documentHash, sourceIds: excerpt.sourceIds }, null, 2)}</pre></details>
    </details>)}
  </section>
}
