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

import { useState } from 'react'
import type { KnowledgeCollection } from './schema'
import type { AgentKnowledge } from '../domain/knowledge-config'
import { knowledgeRequest } from './client'
import { productCatalogSchema, type ProductOption } from './products'
import './product-selector.css'

/** Names aid discovery; the domain still stores the exact, stable SKU. */
export function ProductSelector({ profileId, collections, value, onChange, allowGeneral = false }: {
  profileId: KnowledgeCollection['profileId']; collections?: AgentKnowledge['collections']
  value: string; onChange: (sku: string) => void; allowGeneral?: boolean
}) {
  const [catalog, setCatalog] = useState<{ key: string; products: ProductOption[] } | null>(null)
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const key = JSON.stringify({ profileId, collections })
  const products = catalog?.key === key ? catalog.products : null
  const load = async () => {
    setBusy(true); setError('')
    try {
      const result = productCatalogSchema.parse(await knowledgeRequest({ kind: 'product-list', profileId, ...(collections ? { collections } : {}) }))
      setCatalog({ key, products: result.products })
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е')
  const terms = normalize(query).split(/[\s,]+/).filter(Boolean)
  const found = products?.filter(product => terms.every(term => normalize([product.name, product.sku, ...product.colors, ...product.sizes].join(' ')).includes(term))) ?? []
  const selected = products?.find(product => product.sku === value)
  return <section className="product-selector" aria-label="Выбор товара">
    <p><strong>Товар</strong><br />{selected ? selected.name : value ? 'Товар выбран по коду. Откройте каталог, чтобы увидеть название.' : allowGeneral ? 'Общий материал — без привязки к товару.' : 'Товар пока не выбран.'}</p>
    <button disabled={busy} onClick={() => void load()}>{busy ? 'Загружаем товары…' : products ? 'Обновить каталог товаров' : 'Выбрать товар из базы'}</button>
    {value && <button onClick={() => onChange('')}>Убрать привязку к товару</button>}
    {products && <>
      <label className="field"><span>Найти по названию, цвету или размеру</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Например: мужские, синий" /></label>
      <label className="field"><span>Выберите модель товара</span><select value="" onChange={event => { if (!event.target.value) return; const index = Number(event.target.value); if (found[index]) onChange(found[index].sku) }}>
        <option value="">{found.length ? `Найдено: ${found.length} · выберите товар` : 'Подходящих товаров нет'}</option>
        {found.map((product, index) => <option key={`${product.collectionId}:${product.documentId}:${index}`} value={index}>{product.name} · {product.colors.join(', ')} · {product.sku} · {product.sourceVersion}</option>)}
      </select></label>
      {!found.length && <p className="muted">Проверьте запрос и выбранные коллекции. Каталог читает записи models с названием и canonical_sku из разрешённых снимков. Обновление папки подхватывается через «Обновить снимок».</p>}
    </>}
    {selected && <p className="muted">{selected.colors.length ? `Цвета: ${selected.colors.join(', ')}. ` : ''}{selected.sizes.length ? `Размеры в базе: ${selected.sizes.join(', ')}. ` : ''}Наличие уточняется отдельно. Код: {selected.sku}.</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
  </section>
}
