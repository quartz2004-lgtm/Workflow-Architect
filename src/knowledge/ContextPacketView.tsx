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
    <p className="muted">Выдержки: {packet.excerpts.length} · бюджет {packet.budgetBytes.toLocaleString('ru')} байт{packet.sku ? ` · SKU ${packet.sku}` : ''}</p>
    {!!packet.gaps.length && <div role="status"><strong>Контекст неполон</strong><ul>{packet.gaps.map((gap, index) => <li key={index}>{gap.kind === 'missing-sku' ? 'Товар не найден: ' : gap.kind === 'missing-source' ? 'Источник не найден: ' : ''}{gap.detail}</li>)}</ul></div>}
    {packet.excerpts.map(excerpt => <details key={`${excerpt.collectionId}:${excerpt.documentId}:${excerpt.locator}`}>
      <summary>{excerpt.path} · {excerpt.locator}</summary>
      <p className="muted">Версия {excerpt.sourceVersion}{excerpt.skus.length ? ` · SKU ${excerpt.skus.join(', ')}` : ''}</p>
      <pre>{excerpt.content}</pre>
      <details><summary>Происхождение и контрольные суммы</summary><pre>{JSON.stringify({ collectionId: excerpt.collectionId, snapshotId: excerpt.snapshotId, snapshotDigest: excerpt.snapshotDigest, documentId: excerpt.documentId, documentHash: excerpt.documentHash, sourceIds: excerpt.sourceIds }, null, 2)}</pre></details>
    </details>)}
  </section>
}
