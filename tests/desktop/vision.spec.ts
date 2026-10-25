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

import { _electron as electron, expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createId, createNode, createEdge, createProject } from '../../src/domain/factories'
import { defaultAgentLimits } from '../../src/domain/agent-config'
import { defaultAgentKnowledge } from '../../src/domain/knowledge-config'
import { mediaListSchema, mediaRecordSchema } from '../../src/knowledge/media-schema'
import { contextPacketSchema } from '../../src/knowledge/context'
import { jobSchema } from '../../src/runtime/job-schema'
import { profileIds } from '../../src/profiles/schema'

test('native photos: canonical import, SKU selection, actual pixels to local transport, evidence and revocation', async () => {
  const requests: { messages: { content: string; images?: string[] }[] }[] = []
  let vision = true
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/show') { response.end(JSON.stringify({ capabilities: ['completion', ...(vision ? ['vision'] : [])], model_info: { 'test.context_length': 32768 } })); return }
    requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    response.end(JSON.stringify({ model: 'vision-fixture', done: true, done_reason: 'stop', prompt_eval_count: 3000, eval_count: 30, message: { role: 'assistant', content: 'Synthetic photo response' } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const root = await mkdtemp(join(tmpdir(), 'workflow-vision-desktop-')), source = join(root, 'product.jpg')
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${join(root, 'profile')}`], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
    const encoded = await app.evaluate(({ nativeImage }) => {
      const width = 1200, height = 700, pixels = Buffer.alloc(width * height * 4)
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4, left = x < width / 2
        pixels[index] = left ? 30 : 210; pixels[index + 1] = 40; pixels[index + 2] = left ? 220 : 30; pixels[index + 3] = 255
      }
      return nativeImage.createFromBitmap(pixels, { width, height, scaleFactor: 1 }).toJPEG(95).toString('base64')
    })
    const jpeg = Buffer.from(encoded, 'base64'), metadata = Buffer.from('Exif\0\0PRIVATE-EXIF-TEST'), marker = Buffer.alloc(4)
    marker[0] = 255; marker[1] = 225; marker.writeUInt16BE(metadata.length + 2, 2)
    const original = Buffer.concat([jpeg.subarray(0, 2), marker, metadata, jpeg.subarray(2)])
    await writeFile(source, original)
    await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }) }, source)
    await page.getByRole('button', { name: 'Знания SOAR', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Знания SOAR' })
    await dialog.getByLabel('Название фотографии', { exact: true }).fill('Контрольная фотография')
    await dialog.getByLabel('SKU фотографии', { exact: true }).fill('PHOTO-A')
    await dialog.getByRole('button', { name: 'Выбрать JPEG / PNG…' }).click()
    await expect(dialog.getByRole('img', { name: 'Контрольная фотография' })).toBeVisible()
    const listed = await page.evaluate(profileId => window.workflowDesktop!.knowledge!.request({ kind: 'image-list', profileId }), profileIds[0]) as { value: unknown }
    const media = mediaListSchema.parse(listed.value).images[0]!
    const inspected = await page.evaluate(({ profileId, id }) => window.workflowDesktop!.knowledge!.request({ kind: 'image-inspect', profileId, id }), { profileId: profileIds[0], id: media.id }) as { value: unknown }
    const record = mediaRecordSchema.parse(inspected.value), pixels = Buffer.from(record.image.data, 'base64')
    expect(record.image.width).toBe(512); expect(record.image.height).toBeLessThanOrEqual(512)
    expect(record.sourceHash).toBe(createHash('sha256').update(original).digest('hex'))
    expect(pixels.includes(Buffer.from('PRIVATE-EXIF-TEST'))).toBe(false)
    expect(pixels.includes(Buffer.from('Exif'))).toBe(false)
    expect(pixels.subarray(1, 4).toString()).toBe('PNG')
    await dialog.getByRole('img', { name: 'Контрольная фотография' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'desktop-results/vision-library.png' })
    expect(await page.evaluate(({ profileId, id }) => window.workflowDesktop!.knowledge!.request({ kind: 'image-inspect', profileId, id }), { profileId: profileIds[1], id: media.id })).toMatchObject({ ok: false })
    await rm(source)
    const settings = { ...defaultAgentKnowledge, sku: 'PHOTO-A', imageIds: [media.id], query: 'Опиши видимые детали' }
    const preview = await page.evaluate(({ profileId, settings }) => window.workflowDesktop!.knowledge!.request({ kind: 'context-preview', profileId, settings, task: 'Описание товара' }), { profileId: profileIds[0], settings }) as { value: unknown }
    expect(contextPacketSchema.parse(preview.value).images![0]!.image.data).toBe(record.image.data)
    await page.evaluate(({ profileId, port }) => window.workflowDesktop!.runtime.request({ kind: 'ai', command: { action: 'save', profileId, configuration: { provider: 'ollama', port, model: 'vision-fixture' }, enabled: true } }), { profileId: profileIds[0], port })
    const project = createProject('Vision acceptance'), trigger = createNode('trigger'), agent = createNode('agent'), artifact = createNode('artifact')
    trigger.config = { triggerType: 'manual' }; trigger.operation = { kind: 'manual' }
    agent.config = { role: 'Редактор', systemPrompt: 'Опиши видимое.', model: { provider: 'ollama', name: 'vision-fixture' } }
    agent.operation = { kind: 'agent', limits: defaultAgentLimits, minimumWords: 0, requireTools: false, knowledge: settings }
    artifact.operation = { kind: 'artifact', filename: 'photo.md', format: 'text', source: { kind: 'input', pointer: '' } }
    project.nodes.push(trigger, agent, artifact)
    for (const [a, b] of [[trigger, agent], [agent, artifact]] as const) project.edges.push(createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id))
    const submit = async () => {
      const id = createId()
      const raw = JSON.stringify({ id, profileId: profileIds[0], eventKey: id, project, entryNodeId: trigger.id, input: 'Опиши фото товара PHOTO-A', background: true })
      return jobSchema.parse(await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), raw))
    }
    const get = async (id: string) => jobSchema.parse(await page.evaluate(({ profileId, id }) => window.workflowDesktop!.runtime.request({ kind: 'get', profileId, id }), { profileId: profileIds[0], id }))
    const job = await submit()
    await expect.poll(async () => (await get(job.id)).status).toBe('succeeded')
    expect(requests).toHaveLength(1)
    expect(requests[0]!.messages[1]!.images).toEqual([record.image.data])
    expect(requests[0]!.messages[1]!.content).not.toContain(record.image.data)
    const finished = await get(job.id)
    expect(finished.preparedKnowledge![0]!.packet.images![0]!.hash).toBe(record.hash)
    vision = false
    const unsupported = await submit()
    await expect.poll(async () => (await get(unsupported.id)).status).toBe('failed')
    expect((await get(unsupported.id)).outcome?.error?.message).toContain('Vision')
    expect(requests).toHaveLength(1)
    await dialog.getByRole('button', { name: 'Отозвать доступ к фото' }).click()
    await expect(dialog).toContainText('Доступ отозван')
    await expect(submit()).rejects.toThrow('отозван')
    expect((await get(job.id)).preparedKnowledge![0]!.packet.images![0]!.image.data).toBe(record.image.data)
  } finally { await app.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})
