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
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createId, createNode, createEdge, createProject } from '../../src/domain/factories'
import { defaultAgentLimits } from '../../src/domain/agent-config'
import { defaultAgentKnowledge } from '../../src/domain/knowledge-config'
import { jobSchema } from '../../src/runtime/job-schema'
import { profileIds } from '../../src/profiles/schema'
import { KnowledgeService } from '../../src/knowledge/service'

test('real local Vision identifies different unseen control images through the native workflow', async () => {
  const model = process.env.WORKFLOW_LOCAL_VISION_MODEL
  test.skip(!model, 'Set WORKFLOW_LOCAL_VISION_MODEL to an already installed local vision model.')
  test.setTimeout(660000)
  const root = await mkdtemp(join(tmpdir(), 'workflow-real-vision-'))
  const reportFolder = resolve('output/verification-0.5.3'); await mkdir(reportFolder, { recursive: true })
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${join(root, 'profile')}`], env })
  const report: unknown[] = []
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
    await page.evaluate(({ profileId, model }) => window.workflowDesktop!.runtime.request({ kind: 'ai', command: { action: 'save', profileId, configuration: { provider: 'ollama', port: 11434, model }, enabled: true } }), { profileId: profileIds[0], model: model! })
    for (let variant = 0; variant < 2; variant++) {
      const pixels = await app.evaluate(({ nativeImage }, variant) => {
        const width = 512, height = 320, bitmap = Buffer.alloc(width * height * 4, 255)
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const left = variant === 0 ? (x - 130) ** 2 + (y - 160) ** 2 <= 70 ** 2 : y >= 80 && y <= 240 && Math.abs(x - 130) <= (y - 80) * .5
          const right = variant === 0 ? x >= 310 && x <= 450 && y >= 90 && y <= 230 : (x - 380) ** 2 + (y - 160) ** 2 <= 70 ** 2
          const rgb = left ? variant === 0 ? [230, 25, 25] : [20, 170, 35] : right ? variant === 0 ? [20, 65, 230] : [240, 210, 15] : [255, 255, 255]
          const index = (y * width + x) * 4
          bitmap[index] = rgb[2]!; bitmap[index + 1] = rgb[1]!; bitmap[index + 2] = rgb[0]!; bitmap[index + 3] = 255
        }
        return nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor: 1 }).toPNG().toString('base64')
      }, variant)
      const source = join(root, `source-${variant}.png`)
      await writeFile(source, Buffer.from(pixels, 'base64')); await writeFile(join(reportFolder, `vision-control-${variant}.png`), Buffer.from(pixels, 'base64'))
      await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }) }, source)
      const imported = await page.evaluate(({ profileId, variant }) => window.workflowDesktop!.knowledge!.request({ kind: 'image-import', profileId, label: `Контрольное фото ${variant + 1}`, sku: 'CONTROL' }), { profileId: profileIds[0], variant }) as { ok: boolean; value?: unknown }
      expect(imported.ok).toBe(true); expect(typeof imported.value).toBe('string')
      const project = createProject('Real local Vision'), trigger = createNode('trigger'), agent = createNode('agent'), artifact = createNode('artifact')
      trigger.config = { triggerType: 'manual' }; trigger.operation = { kind: 'manual' }
      const figure = { type: 'object', properties: { color: { type: 'string', enum: ['красный', 'синий', 'зелёный', 'жёлтый'] }, shape: { type: 'string', enum: ['круг', 'квадрат', 'треугольник'] } }, required: ['color', 'shape'], additionalProperties: false }
      agent.config = { role: 'Наблюдатель', systemPrompt: 'Рассмотри прикреплённое изображение. Определи цвет и форму двух фигур: слева и справа. Верни точный JSON. Не угадывай по названию файла.', model: { provider: 'ollama', name: model! }, output: { kind: 'json-schema', schema: { type: 'object', properties: { left: figure, right: figure }, required: ['left', 'right'], additionalProperties: false } } }
      agent.operation = { kind: 'agent', limits: { ...defaultAgentLimits, maxCalls: 1, contextTokens: 8192, maxOutputTokens: 256, maxTotalTokens: 8192, timeoutMs: 300000 }, minimumWords: 0, requireTools: false,
        knowledge: { ...defaultAgentKnowledge, imageIds: [imported.value as string], sku: 'CONTROL' } }
      artifact.operation = { kind: 'artifact', filename: 'observation.json', format: 'json', source: { kind: 'input', pointer: '' } }
      project.nodes.push(trigger, agent, artifact)
      for (const [a, b] of [[trigger, agent], [agent, artifact]] as const) project.edges.push(createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id))
      const id = createId(), started = Date.now()
      const raw = JSON.stringify({ id, profileId: profileIds[0], eventKey: id, project, entryNodeId: trigger.id, input: 'Что изображено слева и справа?', background: true })
      await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), raw)
      const get = async () => jobSchema.parse(await page.evaluate(({ profileId, id }) => window.workflowDesktop!.runtime.request({ kind: 'get', profileId, id }), { profileId: profileIds[0], id }))
      await expect.poll(async () => ['succeeded', 'failed', 'cancelled'].includes((await get()).status), { timeout: 310000, intervals: [1000, 3000, 5000] }).toBe(true)
      const job = await get(), result = job.outcome?.artifacts[0]?.content ? JSON.parse(job.outcome.artifacts[0].content) as unknown : null
      report.push({ variant, model, durationMs: Date.now() - started, status: job.status, result, error: job.outcome?.error, trace: job.events.filter(event => event.kind === 'ai'), imageHash: job.preparedKnowledge![0]!.packet.images![0]!.hash })
      await writeFile(join(reportFolder, 'vision-real.json'), JSON.stringify(report, null, 2))
      expect(job.status, job.outcome?.error?.message).toBe('succeeded')
      expect(result).toEqual(variant === 0 ? { left: { color: 'красный', shape: 'круг' }, right: { color: 'синий', shape: 'квадрат' } } : { left: { color: 'зелёный', shape: 'треугольник' }, right: { color: 'жёлтый', shape: 'круг' } })
    }
  } finally { await app.close() }
})

test('real local Mistral receives a frozen SOAR product and its care rules through the native workflow', async () => {
  const model = process.env.WORKFLOW_LOCAL_VISION_MODEL, sourcePath = process.env.WORKFLOW_KNOWLEDGE_SOURCE
  test.skip(!model || !sourcePath, 'Requires an explicit local model and SOAR source folder.')
  test.setTimeout(360000)
  const root = await mkdtemp(join(tmpdir(), 'workflow-real-soar-')), userData = join(root, 'profile')
  const service = new KnowledgeService(join(userData, 'knowledge'))
  const preview = await service.prepare({ profileId: profileIds[0], label: 'SOAR acceptance', sourcePath: sourcePath!, selectedPaths: [
    'KNOWLEDGE-VERSION.json', 'source/current/products-editorial.json', 'source/current/care-rules-v1.json',
  ] })
  const collectionId = service.commit(profileIds[0], preview.token)
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [resolve('.desktop-app'), `--user-data-dir=${userData}`], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
    await page.evaluate(({ profileId, model }) => window.workflowDesktop!.runtime.request({ kind: 'ai', command: { action: 'save', profileId, configuration: { provider: 'ollama', port: 11434, model }, enabled: true } }), { profileId: profileIds[0], model: model! })
    const project = createProject('SOAR real evidence'), trigger = createNode('trigger'), agent = createNode('agent'), artifact = createNode('artifact')
    trigger.config = { triggerType: 'manual' }; trigger.operation = { kind: 'manual' }
    agent.config = { role: 'Редактор фактов', systemPrompt: 'По переданным источникам подготовь связное описание товара и инструкцию по уходу на русском. Укажи состав основной и подкладочной ткани отдельно. Сохрани условия ухода, не придумывай свойства и наличие. Это техническая проверка фактов, не рекламная публикация.', model: { provider: 'ollama', name: model! } }
    agent.operation = { kind: 'agent', limits: { ...defaultAgentLimits, maxCalls: 1, contextTokens: 16384, maxOutputTokens: 1200, maxTotalTokens: 16384, timeoutMs: 300000 }, minimumWords: 0, requireTools: false,
      knowledge: { ...defaultAgentKnowledge, collections: [{ collectionId }], sku: 'SOAR-SET-B01-DM-01-01-02', query: 'состав уход', maxBytes: 10000, maxExcerpts: 3 } }
    artifact.operation = { kind: 'artifact', filename: 'evidence-description.md', format: 'text', source: { kind: 'input', pointer: '' } }
    project.nodes.push(trigger, agent, artifact)
    for (const [a, b] of [[trigger, agent], [agent, artifact]] as const) project.edges.push(createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id))
    const id = createId(), started = Date.now()
    const raw = JSON.stringify({ id, profileId: profileIds[0], eventKey: id, project, entryNodeId: trigger.id, input: 'Опиши комплект SOAR-SET-B01-DM-01-01-02 и объясни, как за ним ухаживать.', background: true })
    await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), raw)
    const get = async () => jobSchema.parse(await page.evaluate(({ profileId, id }) => window.workflowDesktop!.runtime.request({ kind: 'get', profileId, id }), { profileId: profileIds[0], id }))
    await expect.poll(async () => ['succeeded', 'failed', 'cancelled'].includes((await get()).status), { timeout: 310000, intervals: [1000, 3000, 5000] }).toBe(true)
    const job = await get(), content = job.outcome?.artifacts[0]?.content ?? '', packet = job.preparedKnowledge?.[0]?.packet
    const folder = resolve('output/verification-0.5.3'); await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'soar-real.json'), JSON.stringify({ model, durationMs: Date.now() - started, status: job.status, error: job.outcome?.error, packet, content, trace: job.events.filter(event => event.kind === 'ai') }, null, 2))
    expect(job.status, job.outcome?.error?.message).toBe('succeeded')
    expect(packet!.excerpts.some(excerpt => excerpt.sourceIds.includes('SOAR-CARE-BRIEFS_MEN'))).toBe(true)
    expect(content).toMatch(/91[,.]4/)
    expect(content).toMatch(/8[,.]6/)
    expect(content).toMatch(/40/)
    expect(content.toLowerCase()).toContain('ручн')
    expect(packet!.excerpts.flatMap(excerpt => excerpt.skus).every(sku => sku === 'SOAR-SET-B01-DM-01-01-02')).toBe(true)
  } finally { await app.close() }
})
