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
import { advanceEditorial, createEditorialState } from '../../src/editorial/engine'
import { OllamaProvider } from '../../src/ai/ollama'
import { editorialStateSchema } from '../../src/editorial/engine-schema'
import { groundedReviewSchema } from '../../src/editorial/review'
import { contextPacketSchema } from '../../src/knowledge/context'
import { checkEditorialText } from '../../src/editorial/quality'

test('isolated long writer request completes under its recorded stage deadline', async () => {
  const folder = process.env.WORKFLOW_EDITORIAL_FAILED_WRITER
  test.skip(!folder, 'Explicit saved test evidence required; never resumes a production job.')
  test.setTimeout(660000)
  const original = editorialStateSchema.parse(JSON.parse(await readFile(join(folder!, 'state.json'), 'utf8')))
  const packet = contextPacketSchema.parse(JSON.parse(await readFile(join(folder!, 'packet.json'), 'utf8')))
  const call = original.calls.at(-1)!
  expect(call.stage).toBe('writer'); expect(call.status).toBe('failed')
  const provider = new OllamaProvider({ provider: 'ollama', port: 11434, model: call.settings.model })
  const signal = AbortSignal.timeout(call.settings.callTimeoutMs)
  expect(await provider.identity(call.settings.model, signal)).toBe(call.settings.modelDigest)
  const output = resolve('output/verification-0.5.4', `long-writer-${Date.now()}`)
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'request.json'), JSON.stringify(call, null, 2))
  console.log(`Isolated writer transport check: ${output}`)
  const started = Date.now()
  const response = await provider.chat({ model: call.settings.model,
    messages: [{ role: 'system', content: call.system }, { role: 'user', content: call.prompt }],
    tools: [], maxOutputTokens: call.settings.maxOutputTokens, contextTokens: call.settings.contextTokens, temperature: call.settings.temperature,
  }, signal)
  const formal = checkEditorialText({ task: original.task, text: response.content, finish: response.finish,
    allowedSourceIds: packet.excerpts.flatMap(excerpt => excerpt.sourceIds), knowledgeGaps: packet.gaps.map(gap => gap.detail) })
  await writeFile(join(output, 'response.json'), JSON.stringify({ response, durationMs: Date.now() - started, formal, humanApproved: false }, null, 2))
  await writeFile(join(output, 'draft.md'), response.content)
  expect(response.finish).toBe('stop')
  expect(formal.issues).toEqual([])
})

test('fresh editorial replay of a saved dossier reaches human review without changing the production job', async () => {
  const path = process.env.WORKFLOW_EDITORIAL_DOSSIER_JOB
  test.skip(!path, 'Explicit saved job required; uses a new bounded test task.')
  test.setTimeout(1850000)
  const job = jobSchema.parse(JSON.parse(await readFile(path!, 'utf8')))
  const original = Object.values(job.checkpoint?.editorial ?? {})[0]!
  const packet = contextPacketSchema.parse(job.preparedKnowledge![0]!.packet)
  const model = process.env.WORKFLOW_LOCAL_EDITORIAL_MODEL ?? original.settings.model
  const provider = new OllamaProvider({ provider: 'ollama', port: 11434, model })
  const modelDigest = await provider.identity(model, new AbortController().signal)
  if (packet.handoff) packet.handoff.model = model
  let state = await createEditorialState(original.task, packet, { ...original.settings, model, modelDigest }, original.budget)
  const folder = resolve('output/verification-0.5.4', `dossier-replay-${Date.now()}`)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'packet.json'), JSON.stringify(packet, null, 2))
  for (let step = 0; step < 7 && ['planner', 'writer', 'reviewer'].includes(state.phase); step++) {
    console.log(`Saved dossier replay: ${state.phase}; evidence ${folder}`)
    state = await advanceEditorial({ state, packet, provider, signal: new AbortController().signal, save: async value => {
      await writeFile(join(folder, 'state.json'), JSON.stringify(value, null, 2))
    } })
  }
  for (const version of state.versions) await writeFile(join(folder, `draft-v${version.number}.md`), version.text)
  expect(state.id).not.toBe(original.id)
  expect(state.phase, state.issues.map(issue => issue.message).join('\n')).toBe('awaiting-human')
})

test('grounded reviewer validates an unchanged saved first draft in an isolated task', async () => {
  const source = process.env.WORKFLOW_EDITORIAL_GROUNDED_REVIEW
  test.skip(!source, 'Explicit saved test evidence required; this is not full workflow acceptance.')
  test.setTimeout(660000)
  const original = editorialStateSchema.parse(JSON.parse(await readFile(join(source!, 'state.json'), 'utf8')))
  const packet = contextPacketSchema.parse(JSON.parse(await readFile(join(source!, 'packet.json'), 'utf8')))
  let state = await createEditorialState(original.task, packet, original.settings, original.budget)
  state.versions = [{ ...structuredClone(original.versions[0]!), id: crypto.randomUUID(), taskId: state.id }]
  state.phase = 'reviewer'
  state.issues = state.versions[0]!.issues.filter(issue => issue.origin === 'program')
  const folder = resolve('output/verification-0.5.4', `grounded-review-${Date.now()}`)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'seed.json'), JSON.stringify({ source, versionId: original.versions[0]!.id, humanApproved: false }))
  await writeFile(join(folder, 'packet.json'), JSON.stringify(packet, null, 2))
  console.log(`Grounded review only: ${folder}`)
  const provider = new OllamaProvider({ provider: 'ollama', port: 11434, model: state.settings.model })
  state = await advanceEditorial({ state, packet, provider, signal: new AbortController().signal, save: async value => {
    await writeFile(join(folder, 'state.json'), JSON.stringify(value, null, 2))
  } })
  expect(state.versions[0]!.text).toBe(original.versions[0]!.text)
  expect(state.calls).toHaveLength(1)
  expect(state.calls[0]!.status).toBe('complete')
  expect(['writer', 'awaiting-human'], state.issues.map(issue => issue.message).join('\n')).toContain(state.phase)
})

test('structured additions preserve section integrity on a real saved draft', async () => {
  const source = process.env.WORKFLOW_EDITORIAL_SECTION_PROBE
  test.skip(!source, 'Explicit saved test evidence required; one writer call, not full acceptance.')
  test.setTimeout(660000)
  const original = editorialStateSchema.parse(JSON.parse(await readFile(join(source!, 'state.json'), 'utf8')))
  const packet = contextPacketSchema.parse(JSON.parse(await readFile(join(source!, 'packet.json'), 'utf8')))
  let state = await createEditorialState(original.task, packet, original.settings, original.budget)
  state.versions = [{ ...structuredClone(original.versions[0]!), id: crypto.randomUUID(), taskId: state.id }]
  state.phase = 'writer'
  state.issues = checkEditorialText({ task: state.task, text: state.versions[0]!.text, finish: 'stop', allowedSourceIds: packet.excerpts.flatMap(excerpt => excerpt.sourceIds), knowledgeGaps: [] }).issues
  const folder = resolve('output/verification-0.5.4', `section-probe-${Date.now()}`)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'seed.json'), JSON.stringify({ source, versionId: original.versions[0]!.id, humanApproved: false }))
  await writeFile(join(folder, 'packet.json'), JSON.stringify(packet, null, 2))
  console.log(`Structured addition probe only: ${folder}`)
  const provider = new OllamaProvider({ provider: 'ollama', port: 11434, model: state.settings.model })
  state = await advanceEditorial({ state, packet, provider, signal: new AbortController().signal, save: async value => {
    await writeFile(join(folder, 'state.json'), JSON.stringify(value, null, 2))
  } })
  expect(state.phase, state.issues.map(issue => issue.message).join('\n')).toBe('reviewer')
  expect(state.versions).toHaveLength(2)
  expect(JSON.parse(state.calls[0]!.response!).additions.length).toBeGreaterThan(0)
  expect(state.versions[0]!.text).toBe(original.versions[0]!.text)
  expect(state.issues.filter(issue => issue.code === 'structure')).toEqual([])
  await writeFile(join(folder, 'draft-v2.md'), state.versions[1]!.text)
})

test('real bounded reviewer preserves a correction budget for a saved draft', async () => {
  const folder = process.env.WORKFLOW_EDITORIAL_REVIEW_EVIDENCE
  test.skip(!folder, 'Explicit saved local evidence required.')
  test.setTimeout(660000)
  let state = editorialStateSchema.parse(JSON.parse(await readFile(join(folder!, 'state.json'), 'utf8')))
  const packet = contextPacketSchema.parse(JSON.parse(await readFile(join(folder!, 'packet.json'), 'utf8')))
  expect(state.calls.every(call => call.status === 'complete')).toBe(true)
  expect(state.calls).toHaveLength(5)
  state.phase = 'reviewer'; state.issues = state.versions.at(-1)!.issues.filter(issue => issue.origin === 'program')
  const output = resolve('output/verification-0.5.4', `bounded-review-${Date.now()}`)
  await mkdir(output, { recursive: true })
  const provider = new OllamaProvider({ provider: 'ollama', port: 11434, model: state.settings.model })
  console.log(`Bounded review: ${output}`)
  state = await advanceEditorial({ state, packet, provider, signal: new AbortController().signal, save: async value => { await writeFile(join(output, 'state.json'), JSON.stringify(value, null, 2)) } })
  expect(state.calls.at(-1)?.status).toBe('complete')
  const review = groundedReviewSchema.parse(JSON.parse(state.calls.at(-1)!.response!))
  expect(review.comments.length).toBeLessThanOrEqual(5)
  // Probe the next prompt's size without spending another generation or
  // modifying the saved real review. A controlled exception stops the probe.
  expect(state.phase).toBe('writer')
  let nextRequestFits = false
  provider.chat = async () => { nextRequestFits = true; throw new Error('TEST_ONLY_CONTEXT_PROBE') }
  await advanceEditorial({ state, packet, provider, signal: new AbortController().signal, save: async () => {} })
  await writeFile(join(output, 'sizing.json'), JSON.stringify({ nextRequestFits, comments: review.comments.length, humanApproved: false }))
  expect(nextRequestFits).toBe(true)
})

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
