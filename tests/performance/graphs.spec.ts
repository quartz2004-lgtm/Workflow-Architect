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

import { expect, test, type Page } from '../fixtures'
import { writeFile } from 'node:fs/promises'
import { createEdge, createNode, createProject } from '../../src/domain/factories'

async function frames(page: Page, action: () => Promise<void>) {
  const measurement = page.evaluate(() => new Promise<{ frames: number; p95: number; max: number; longTasks: number[] }>(resolve => {
    const samples: number[] = [], longTasks: number[] = []
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration) })
    observer.observe({ type: 'longtask', buffered: false })
    let previous = 0, start = 0
    const tick = (now: number) => {
      if (!start) start = now
      if (previous) samples.push(now - previous)
      previous = now
      if (now - start < 2000) requestAnimationFrame(tick)
      else { observer.disconnect(); samples.sort((a, b) => a - b); resolve({ frames: samples.length, p95: samples[Math.floor(samples.length * 0.95)] ?? 0, max: Math.max(...samples), longTasks }) }
    }
    requestAnimationFrame(tick)
  }))
  await action()
  return measurement
}

for (const count of [100, 300]) test(`${count} nodes: production drag, pan, zoom, edit and autosave`, async ({ page }, info) => {
  const project = createProject(`Profile ${count}`)
  for (let i = 0; i < count; i++) {
    const node = createNode(i % 4 === 0 ? 'agent' : 'concept', { x: (i % 10) * 330, y: Math.floor(i / 10) * 210 })
    node.title = `Step ${i}`; project.nodes.push(node)
    if (i) { const previous = project.nodes[i - 1]!; project.edges.push(createEdge(previous.id, node.id, previous.ports[1]!.id, node.ports[0]!.id)) }
  }
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть проекты' }).click()
  const began = performance.now()
  await page.getByLabel('Файл проекта').setInputFiles({ name: 'profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('button', { name: 'Открыть импорт' }).click()
  await expect(page.locator('.react-flow__node-workflow')).toHaveCount(count)
  const importMs = performance.now() - began
  await page.getByRole('button', { name: 'Поиск', exact: true }).click()
  await page.getByRole('textbox', { name: 'Поиск узлов и тегов' }).fill('Step 45')
  await page.locator('.search-results button').first().click()
  const node = page.locator('.react-flow__node-workflow').filter({ hasText: 'Step 45' })
  await expect(node).toBeVisible()
  const box = (await node.boundingBox())!
  const drag = await frames(page, async () => {
    await page.mouse.move(box.x + 100, box.y + 55); await page.mouse.down()
    await page.mouse.move(box.x + 240, box.y + 110, { steps: 65 }); await page.mouse.up()
    await expect(page.locator('.save-status')).toContainText('Сохранено')
  })
  const canvas = (await page.getByRole('application').boundingBox())!
  const pan = await frames(page, async () => {
    await page.mouse.move(canvas.x + 80, canvas.y + 80); await page.mouse.down({ button: 'middle' })
    await page.mouse.move(canvas.x + 210, canvas.y + 200, { steps: 65 }); await page.mouse.up({ button: 'middle' })
  })
  const zoom = await frames(page, async () => { for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i % 2 ? -90 : 90) } })
  await node.click()
  const edit = await frames(page, async () => {
    const title = page.getByRole('textbox', { name: 'Название', exact: true })
    await title.fill('Profile edited node'); await title.press('Enter')
    await expect(page.locator('.save-status')).toContainText('Сохранено')
  })
  await page.reload()
  await expect(page.locator('.react-flow__node-workflow')).toHaveCount(count)
  await expect(page.locator('.react-flow__node-workflow').filter({ hasText: 'Profile edited node' })).toHaveCount(1)
  const metrics = { count, importMs, drag, pan, zoom, edit, errors }
  await writeFile(info.outputPath('metrics.json'), JSON.stringify(metrics, null, 2))
  await page.screenshot({ path: info.outputPath('canvas.png') })
  expect(errors).toEqual([])
  for (const sample of [drag, pan, zoom, edit]) expect(sample.p95).toBeLessThan(count === 100 ? 34 : 50)
})
