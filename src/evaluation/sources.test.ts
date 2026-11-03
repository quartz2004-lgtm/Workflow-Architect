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

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { digest } from '../knowledge/importer'
import { captureEvaluationSources, verifyEvaluationSources } from './sources'
import draft from '../../evaluation/soar-0.5.5-draft.json'

const folders: string[] = []
afterEach(async () => {
  for (const folder of folders.splice(0)) {
    const target = resolve(folder)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('wa-evaluation-')) throw new Error('Unsafe temporary cleanup target.')
    await rm(target, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'wa-evaluation-')); folders.push(root)
  await mkdir(join(root, 'source/current'), { recursive: true })
  await writeFile(join(root, 'source/current/products-editorial.json'), JSON.stringify({ models: [{ canonical_sku: 'TEST-SOCKS', article: 'TEST-01', name: 'Носки', features: 'Четыре пары' }] }))
  const task = { id: crypto.randomUUID(), kind: 'knowledge-answer', split: 'development', prompt: 'Сколько пар в TEST-01?', contract: { minimumWords: 0, minimumSections: 0 } }
  return { root, input: { sourcePath: root, selectedPaths: ['source/current/products-editorial.json'], tasks: [task], maxBytes: 16000, maxExcerpts: 12 } }
}
describe('evaluation source snapshots', () => {
  it('freezes explicit evidence requirements and reports an absent record', async () => {
    const { input, root } = await fixture()
    await writeFile(join(root, 'source/current/claims.json'), JSON.stringify({ claims: [{ id: 'REQUIRED-CLAIM', text: 'Unrelated vocabulary with essential scope restriction.' }] }))
    const captured = await captureEvaluationSources({ ...input, selectedPaths: [...input.selectedPaths, 'source/current/claims.json'], tasks: [{ ...input.tasks[0], sourceIds: ['REQUIRED-CLAIM', 'MISSING-CLAIM'] }] })
    expect(captured.tasks[0]!.packet.excerpts.some(item => item.sourceIds.includes('REQUIRED-CLAIM'))).toBe(true)
    expect(captured.tasks[0]!.packet.gaps).toContainEqual({ kind: 'missing-source', detail: 'MISSING-CLAIM' })
    expect(verifyEvaluationSources(captured).tasks[0]!.brief.sourceIds).toEqual(['REQUIRED-CLAIM', 'MISSING-CLAIM'])
    captured.tasks[0]!.brief.sourceIds = []
    expect(() => verifyEvaluationSources(captured)).toThrow('frozen task and snapshot')
  })
  it('reuses frozen bytes offline after the source changes without modifying the source', async () => {
    const { root, input } = await fixture()
    const path = join(root, input.selectedPaths[0]!), before = await readFile(path, 'utf8')
    const captured = await captureEvaluationSources(input)
    expect(await readFile(path, 'utf8')).toBe(before)
    expect(captured.tasks[0]!.packet.excerpts.length).toBeGreaterThan(0)
    await writeFile(path, 'changed after capture')
    const restored = verifyEvaluationSources(JSON.parse(JSON.stringify(captured)))
    expect(restored.snapshot.documents[0]!.content).toBe(before)
    expect(restored.tasks[0]!.packetDigest).toBe(captured.tasks[0]!.packetDigest)
  })
  it('refuses missing selected files instead of silently narrowing the experiment', async () => {
    const { input } = await fixture()
    input.selectedPaths.push('source/current/missing.md')
    await expect(captureEvaluationSources(input)).rejects.toThrow('missing')
  })
  it('detects modified packets even when their digest was recomputed', async () => {
    const { input } = await fixture(), captured = await captureEvaluationSources(input)
    captured.tasks[0]!.packet.excerpts[0]!.content = 'Invented facts'
    captured.tasks[0]!.packetDigest = digest(JSON.stringify(captured.tasks[0]!.packet))
    expect(() => verifyEvaluationSources(captured)).toThrow('frozen task and snapshot')
  })
  it('rejects modified snapshot content and task substitution', async () => {
    const { input } = await fixture(), captured = await captureEvaluationSources(input)
    const changed = structuredClone(captured); changed.snapshot.documents[0]!.content = 'Different content'
    expect(() => verifyEvaluationSources(changed)).toThrow()
    captured.tasks[0]!.brief.prompt = 'New task'
    expect(() => verifyEvaluationSources(captured)).toThrow('frozen task and snapshot')
  })
  it('keeps missing-source gaps visible and excludes archived answers', async () => {
    const { input } = await fixture()
    input.tasks[0]!.prompt = 'UNAVAILABLE-99'
    const captured = await captureEvaluationSources(input)
    expect(captured.tasks[0]!.packet.gaps.length).toBeGreaterThan(0)
    await expect(captureEvaluationSources({ ...input, selectedPaths: ['jobs/answers.md'] })).rejects.toThrow()
  })
})

it.skipIf(!process.env.WORKFLOW_EVALUATION_SOURCE)('captures the real SOAR draft without calling a model or claiming reference approval', async () => {
  const root = process.env.WORKFLOW_EVALUATION_SOURCE!
  const configuration: Parameters<typeof captureEvaluationSources>[0] = process.env.WORKFLOW_EVALUATION_SOURCE_CONFIG
    ? JSON.parse(await readFile(process.env.WORKFLOW_EVALUATION_SOURCE_CONFIG, 'utf8'))
    : { sourcePath: root, tasks: draft.cases, maxBytes: 16000, maxExcerpts: 12,
    selectedPaths: ['KNOWLEDGE-VERSION.json', 'source/current/products-editorial.json', 'source/current/claims.json', 'source/current/care-rules-v1.json', 'source/current/product-sizing-owner-facts.json', 'source/current/CONTENT-RULES.md', 'source/current/material-description-approved-v2.md', 'docs/SMM-EDITORIAL-v2.md', 'docs/CONTENT-DEPTH-v1.md', 'docs/CHANNELS-v1.md'],
  }
  const bundle = await captureEvaluationSources(configuration)
  const output = resolve('output/evaluation-0.5.5', `sources-${bundle.id}`)
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'sources.json'), JSON.stringify(bundle, null, 2))
  const summary = { id: bundle.id, snapshotDigest: bundle.snapshot.digest, sourceVersion: bundle.snapshot.sourceVersion, documents: bundle.snapshot.documents.length,
    tasks: bundle.tasks.map(task => ({ id: task.brief.id, kind: task.brief.kind, split: task.brief.split, packetDigest: task.packetDigest, excerpts: task.packet.excerpts.length, gaps: task.packet.gaps })),
    referenceApproval: 'not-performed', modelCalls: 0,
  }
  await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2))
  expect(verifyEvaluationSources(bundle).tasks).toHaveLength(bundle.tasks.length)
  console.log(JSON.stringify({ output, documents: summary.documents, tasks: summary.tasks.length, tasksWithGaps: summary.tasks.filter(task => task.gaps.length).length }))
})
