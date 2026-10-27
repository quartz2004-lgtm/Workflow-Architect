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
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createEditorialExample } from '../../src/execution/editorial-example'
import { defaultAgentKnowledge } from '../../src/domain/knowledge-config'
import { jobSchema } from '../../src/runtime/job-schema'
import { profileIds } from '../../src/profiles/schema'
import { KnowledgeService } from '../../src/knowledge/service'
import { buildContextPacket } from '../../src/knowledge/context'
import { advanceEditorial } from '../../src/editorial/engine'
import { OllamaProvider } from '../../src/ai/ollama'

test('real revision replay uses completed evidence without repeating planner or first draft', async () => {
  const path = process.env.WORKFLOW_EDITORIAL_REVISION_JOB
  test.skip(!path, 'Explicit local evidence required; no production job is changed.')
  test.setTimeout(1850000)
  const job = jobSchema.parse(JSON.parse(await readFile(path!, 'utf8')))
  let state = structuredClone(Object.values(job.checkpoint?.editorial ?? {})[0]!)
  const packet = job.preparedKnowledge![0]!.packet
  expect(state.phase).toBe('needs-editing')
  expect(state.calls.every(call => call.status === 'complete')).toBe(true)
  expect(state.issues.at(-1)?.message).toContain('контекст')
  expect(state.versions).toHaveLength(1)
  const originalCalls = state.calls.map(call => call.id)
  // Controlled test continuation only: preserve deadline/tokens, remove the
  // observed sizing error, retain all editorial remarks for the latest draft.
  state.phase = 'writer'; state.issues = structuredClone(state.versions.at(-1)!.issues)
  const folder = resolve('output/verification-0.5.4', `revision-${Date.now()}`)
  await mkdir(folder, { recursive: true })
  const provider = new OllamaProvider({ provider: 'ollama', port: 11434, model: state.settings.model })
  const save = async (value: typeof state) => { await writeFile(join(folder, 'state.json'), JSON.stringify(value, null, 2)) }
  await writeFile(join(folder, 'packet.json'), JSON.stringify(packet, null, 2))
  for (let step = 0; step < 4 && ['writer', 'reviewer'].includes(state.phase); step++) {
    console.log(`Revision replay: ${state.phase}; evidence ${folder}`)
    state = await advanceEditorial({ state, packet, provider, signal: new AbortController().signal, save })
  }
  for (const version of state.versions) await writeFile(join(folder, `draft-v${version.number}.md`), version.text)
  expect(state.calls.slice(0, 3).map(call => call.id)).toEqual(originalCalls)
  expect(state.phase, state.issues.map(issue => issue.message).join('\n')).toBe('awaiting-human')
})

test('real source preflight measures complete bounded dossiers without calling a model', async () => {
  const sourcePath = process.env.WORKFLOW_SOAR_SOURCE
  test.skip(!sourcePath, 'Explicit authorized source required.')
  const root = await mkdtemp(join(tmpdir(), 'workflow-soar-preflight-')), service = new KnowledgeService(root)
  const profileId = profileIds[0]
  const preview = await service.prepare({ profileId, sourcePath: sourcePath!, label: 'SOAR preflight', selectedPaths: ['KNOWLEDGE-VERSION.json', 'source/current/products-editorial.json', 'source/current/CONTENT-RULES.md', 'source/current/care-rules-v1.json', 'source/current/material-description-approved-v2.md'] })
  const collectionId = service.commit(profileId, preview.token)
  const sources = service.capture(profileId, [{ collectionId }])
  const report = ['SOAR-SET-B01-DM-01-01-02', 'посадка', 'примерка', 'уход', 'бельё комфорт'].map(query => {
    const packet = buildContextPacket({ profileId, runId: crypto.randomUUID(), task: 'Подготовка статьи о выборе белья', query, sku: 'SOAR-SET-B01-DM-01-01-02', maxBytes: 16000, maxExcerpts: 12 }, sources)
    return { query, bytes: Buffer.byteLength(JSON.stringify(packet)), gaps: packet.gaps, sources: packet.excerpts.map(excerpt => `${excerpt.path}:${excerpt.locator}`) }
  })
  await mkdir(resolve('output/verification-0.5.4'), { recursive: true })
  await writeFile(resolve('output/verification-0.5.4/source-preflight.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  expect(report.some(item => !item.gaps.length)).toBe(true)
})

test('real SOAR editorial stages preserve evidence and wait for human review', async () => {
  const model = process.env.WORKFLOW_LOCAL_EDITORIAL_MODEL, source = process.env.WORKFLOW_SOAR_SOURCE
  test.skip(!model || !source, 'Explicit installed model and authorized local SOAR source required.')
  test.setTimeout(1950000)
  const replay = process.env.WORKFLOW_EDITORIAL_REPLAY_JOB ? jobSchema.parse(JSON.parse(await readFile(process.env.WORKFLOW_EDITORIAL_REPLAY_JOB, 'utf8'))) : undefined
  const root = await mkdtemp(join(tmpdir(), 'workflow-real-editorial-'))
  const reportFolder = resolve('output/verification-0.5.4', `editorial-${Date.now()}`)
  await mkdir(reportFolder, { recursive: true })
  await writeFile(join(reportFolder, 'environment.json'), JSON.stringify({ root, model, source, started: new Date().toISOString() }, null, 2))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ ...(process.env.DESKTOP_EXECUTABLE ? { executablePath: process.env.DESKTOP_EXECUTABLE } : {}), args: [...(process.env.DESKTOP_EXECUTABLE ? [] : [resolve('.desktop-app')]), `--user-data-dir=${join(root, 'profile')}`], env })
  try {
    const page = await app.firstWindow(), profileId = profileIds[0]
    await page.getByRole('button', { name: 'Пропустить настройку' }).click()
    await expect.poll(() => page.evaluate(async () => (await window.workflowDesktop!.runtime.state() as { status: string }).status)).toBe('ready')
    await page.evaluate(({ profileId, model }) => window.workflowDesktop!.runtime.request({ kind: 'ai', command: { action: 'save', profileId, configuration: { provider: 'ollama', port: 11434, model }, enabled: true } }), { profileId, model: model! })
    const prepared = await page.evaluate(({ profileId, sourcePath }) => window.workflowDesktop!.knowledge!.request({ kind: 'prepare', profileId, sourcePath, label: 'SOAR · реальная редакционная приёмка', selectedPaths: ['KNOWLEDGE-VERSION.json', 'source/current/products-editorial.json', 'source/current/CONTENT-RULES.md', 'source/current/care-rules-v1.json', 'source/current/material-description-approved-v2.md'] }), { profileId, sourcePath: source! }) as { ok: boolean; value: { token: string } }
    expect(prepared.ok).toBe(true)
    const committed = await page.evaluate(({ profileId, token }) => window.workflowDesktop!.knowledge!.request({ kind: 'commit', profileId, token }), { profileId, token: prepared.value.token }) as { ok: boolean; value: string }
    expect(committed.ok).toBe(true)
    const project = createEditorialExample(model!, { ...defaultAgentKnowledge, collections: [{ collectionId: committed.value }], sku: replay ? '' : 'SOAR-SET-B01-DM-01-01-02', query: replay ? '' : process.env.WORKFLOW_EDITORIAL_QUERY ?? '', maxBytes: 16000, maxExcerpts: 12 })
    const id = crypto.randomUUID()
    const input = { text: 'Как выбрать мужское бельё для комфорта: посадка, ощущения в движении и разумная примерка. Используй комплект SOAR чёрный и синий как конкретный пример, не превращай статью в каталог. Не обещай медицинских эффектов и не выдумывай свойства. Нужен живой полезный текст с примерами, без повторов и рекламных штампов.', audience: 'Взрослые покупатели, которые хотят разобраться в выборе удобного белья', minimumWords: 600 }
    const raw = JSON.stringify({ id, profileId, eventKey: id, project, entryNodeId: project.nodes[0]!.id, input: replay?.input ?? input, background: true })
    await writeFile(join(reportFolder, 'submission.json'), raw)
    await page.evaluate(raw => window.workflowDesktop!.runtime.request({ kind: 'submit', request: JSON.parse(raw) as unknown }), raw)
    const get = async () => jobSchema.parse(await page.evaluate(({ profileId, id }) => window.workflowDesktop!.runtime.request({ kind: 'get', profileId, id }), { profileId, id }))
    let last = ''
    await expect.poll(async () => {
      const job = await get()
      await writeFile(join(reportFolder, 'job.json'), JSON.stringify(job, null, 2))
      const state = Object.values(job.checkpoint?.editorial ?? {})[0]
      const progress = `${job.status}/${state?.phase ?? 'preparing'}/${state?.calls.length ?? 0}`
      if (progress !== last) { console.log(`Editorial acceptance: ${progress}; evidence ${reportFolder}`); last = progress }
      return ['waiting', 'succeeded', 'failed', 'cancelled'].includes(job.status)
    }, { timeout: 1850000, intervals: [1000, 5000] }).toBe(true)
    const job = await get(), state = Object.values(job.checkpoint?.editorial ?? {})[0]
    for (const version of state?.versions ?? []) await writeFile(join(reportFolder, `draft-v${version.number}.md`), version.text)
    await writeFile(join(reportFolder, 'job.json'), JSON.stringify(job, null, 2))
    expect(job.status, job.message || job.outcome?.error?.message).toBe('waiting')
    expect(state?.calls.map(call => call.stage).slice(0, 3)).toEqual(['planner', 'writer', 'reviewer'])
    expect(state?.phase).toBe('awaiting-human')
    expect(job.outcome?.artifacts ?? []).toEqual([])
    // The real text is deliberately not auto-approved: an editorial read follows.
  } finally { await app.close() }
})
