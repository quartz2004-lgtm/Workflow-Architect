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

import { expect, it } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cpus, totalmem, freemem, platform, release } from 'node:os'
import { verifyEvaluationSources } from './sources'
import { createEditorialState, advanceEditorial } from '../editorial/engine'
import { editorialStateSchema } from '../editorial/engine-schema'
import { AtomicStore } from '../runtime/atomic-store'
import { OllamaProvider } from '../ai/ollama'

/** Opt-in development smoke, never a replacement for a frozen quality comparison. */
it.runIf(!!process.env.WORKFLOW_EVALUATION_SMOKE_SOURCE)('records a real local development chain against an existing frozen source packet', async () => {
  const sourcePath = process.env.WORKFLOW_EVALUATION_SMOKE_SOURCE!
  const bundle = verifyEvaluationSources(JSON.parse(readFileSync(sourcePath, 'utf8')))
  const selected = bundle.tasks.find(item => item.brief.split === 'development' && item.brief.kind === 'knowledge-answer')!
  expect(selected).toBeDefined()
  const model = 'mistral-small3.2:24b'
  const provider = new OllamaProvider({ provider: 'ollama', port: 11434, model })
  const signal = AbortSignal.timeout(600000)
  const modelDigest = await provider.identity(model, signal)
  const { brief, packet } = selected
  let state = await createEditorialState({ schemaVersion: '0.5.5', kind: brief.kind, text: brief.prompt, audience: 'Общая аудитория', language: 'Русский', ...brief.contract }, packet,
    { model, modelDigest, contextTokens: 32768, maxOutputTokens: 4096, temperature: 0.3, seed: 17, callTimeoutMs: 300000 })
  const output = resolve('output/evaluation-0.5.5', `development-smoke-${state.id}`)
  mkdirSync(output, { recursive: true })
  const store = new AtomicStore(join(output, 'state'), editorialStateSchema)
  const hardware = () => ({ at: new Date().toISOString(), cpu: cpus()[0]?.model ?? null, logicalCores: cpus().length, ramTotalBytes: totalmem(), ramFreeBytes: freemem(), platform: platform(), release: release() })
  writeFileSync(join(output, 'manifest.json'), JSON.stringify({ purpose: 'development-smoke-not-release-evaluation', sourceBundleId: bundle.id, packetDigest: selected.packetDigest, brief, model, modelDigest, seed: 17, before: hardware() }, null, 2), { flag: 'wx' })
  writeFileSync(join(output, 'packet.json'), JSON.stringify(packet, null, 2), { flag: 'wx' })
  store.write(state.id, state, 'create')
  while (['planner', 'writer', 'reviewer'].includes(state.phase)) {
    state = await advanceEditorial({ state, packet, provider, signal, save: async value => { store.write(value.id, value, 'replace') } })
  }
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ phase: state.phase, calls: state.calls.map(call => ({ stage: call.stage, status: call.status, metrics: call.metrics, error: call.error })), issues: state.issues, after: hardware() }, null, 2), { flag: 'wx' })
  expect(store.read(state.id)).toEqual(state)
  expect(state.phase).toBe('awaiting-human')
}, 650000)
