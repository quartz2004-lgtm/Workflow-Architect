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

import { JobManager } from './job-manager'
import { parseServiceRequest, serviceRequestSchema } from './service-protocol'
import type {} from 'electron'
import { join } from 'node:path'
import { ConnectionStore } from '../ai/connection-store'
import { AssistantService } from '../ai/assistant-service'
import { IntegrationService } from '../integrations/service'
import { CredentialChannel } from '../integrations/credential-channel'
import { KnowledgeService } from '../knowledge/service'
import { KnowledgeRuntime } from '../knowledge/runtime'
import { MediaStore } from '../knowledge/media-store'

const port = process.parentPort
if (!port || !process.argv[2]) throw new Error('Runtime must be started by its desktop parent.')
const send = (message: unknown) => port.postMessage(message)
const credentials = new CredentialChannel(send)
const connections = new ConnectionStore(join(process.argv[2], '..', 'ai-connections'))
const assistant = new AssistantService(connections)
const manager: JobManager = new JobManager(process.argv[2], {
  knowledge: new KnowledgeRuntime(new KnowledgeService(join(process.argv[2], '..', '..', 'knowledge')), new MediaStore(join(process.argv[2], '..', '..', 'knowledge-media'))),
  connector: profileId => (connectionId, key, action, args, signal) => integrations.broker.execute(profileId, connectionId, key, action, args, signal),
  provider: profileId => model => connections.resolve(profileId, model),
  changed: job => send({ version: '0.3.1', kind: 'changed', jobId: job.id, profileId: job.profileId }),
  unavailable: message => send({ version: '0.3.1', kind: 'unavailable', message }),
})
const integrations: IntegrationService = new IntegrationService(join(process.argv[2], '..', 'integrations'), join(__dirname, 'filesystem.cjs'), credentials.resolve, manager, connections)
port.on('message', async event => {
  if (credentials.receive(event.data)) return
  let requestId: string | undefined
  try {
    const candidate = serviceRequestSchema.shape.requestId.safeParse(event.data && typeof event.data === 'object' ? event.data.requestId : undefined)
    if (candidate.success) requestId = candidate.data
    const request = parseServiceRequest(event.data)
    requestId = request.requestId
    const command = request.command
    let result: unknown
    switch (command.kind) {
      case 'integrations': result = await integrations.handle(command.command); break
      case 'ai': result = await assistant.handle(command.command); break
      case 'submit': result = manager.submit(command.request); break
      case 'list': result = manager.list(command.profileId); break
      case 'get': result = manager.get(command.profileId, command.id); break
      case 'cancel': result = manager.cancel(command.profileId, command.id); break
      case 'resume': result = manager.resume(command.profileId, command.id); break
      case 'remove': manager.remove(command.profileId, command.id); result = null; break
      case 'answer': result = manager.answer(command.profileId, command.id, command.requestId, command.value); break
      case 'close-window': assistant.closeWindow(); manager.closeWindow(); result = null; break
      case 'wake': manager.wake(); result = null; break
      case 'stop': integrations.stop(); assistant.stop(); manager.stop(); result = null; break
    }
    send({ version: '0.3.1', kind: 'reply', requestId, ok: true, result })
    if (command.kind === 'stop') setTimeout(() => process.exit(0), 0)
  } catch (error) {
    // No command body, environment or input values are printed to process logs.
    const message = integrations.broker.redactor.redact(error instanceof Error ? error.message.slice(0, 4000) : 'Ошибка runtime.')
    if (requestId) send({ version: '0.3.1', kind: 'reply', requestId, ok: false, message })
  }
})
manager.start()
integrations.start()
if (manager.available) send({ version: '0.3.1', kind: 'ready', damaged: manager.damaged })
