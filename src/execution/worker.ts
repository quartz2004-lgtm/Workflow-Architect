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

import { compileProject } from './compiler'
import { ExecutionRun } from './executor'
import { parseWorkerCommand, type WorkerResponse } from './protocol'

// Dedicated module Worker: no Electron bridge, filesystem, shell or network adapters.
let jobId: string | undefined
let run: ExecutionRun | undefined
const send = (message: WorkerResponse) => self.postMessage(message)
self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const command = parseWorkerCommand(event.data)
    if (command.kind === 'start') {
      if (jobId) throw new Error('Worker уже используется. Для нового запуска нужен новый Worker.')
      jobId = command.jobId
      const result = compileProject(command.project, command.entryNodeId)
      if (!result.ok) { send({ kind: 'rejected', jobId, diagnostics: result.diagnostics }); return }
      run = new ExecutionRun(result.plan, event => send({ kind: 'event', jobId: command.jobId, event }))
      send({ kind: 'ready', jobId, runId: run.id, planId: result.plan.id, diagnostics: result.diagnostics })
      const outcome = await run.start(command.input)
      send({ kind: 'complete', jobId, outcome })
    } else if (command.jobId === jobId && run) {
      if (command.kind === 'cancel') run.cancel()
      else send({ kind: 'answer-result', jobId, requestId: command.requestId, ...run.answer(command.requestId, command.value) })
    }
  } catch (error) {
    if (jobId) send({ kind: 'fault', jobId, message: error instanceof Error ? error.message : String(error) })
    else throw error
  }
}
