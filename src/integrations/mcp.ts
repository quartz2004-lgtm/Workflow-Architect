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

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { z } from 'zod'
import { ScopedFiles } from './files'
import { canonicalJson, contentHash } from './effect-store'
import { assertValueBudget } from '../execution/values'
import type { JsonValue } from '../domain/execution-config'
import type { ConnectionSettings } from './schema'

type Settings = Extract<ConnectionSettings, { kind: 'mcp-filesystem' }>
// Destructive moves/deletes, root management and unbounded recursive searches are not granted in 0.5.
const supported = new Set(['read_text_file', 'write_file', 'list_directory', 'get_file_info'])
export class FilesystemMcp {
  constructor(private readonly entryPath: string, private readonly executable = process.execPath) {}
  private async session<T>(settings: Settings, signal: AbortSignal, action: (client: Client, files: ScopedFiles) => Promise<T>): Promise<T> {
    const files = new ScopedFiles(settings.root, true)
    signal.throwIfAborted()
    const transport = new StdioClientTransport({ command: this.executable, args: [this.entryPath, files.root], cwd: files.root, stderr: 'pipe', env: { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...(process.env.PATH ? { PATH: process.env.PATH } : {}), ELECTRON_RUN_AS_NODE: '1' } })
    const client = new Client({ name: 'Workflow Architect', version: '0.5.0' }, { capabilities: {} })
    const abort = () => { void transport.close() }
    signal.addEventListener('abort', abort, { once: true })
    try { await client.connect(transport); signal.throwIfAborted(); return await action(client, files) }
    finally { signal.removeEventListener('abort', abort); await client.close() }
  }
  async discover(settings: Settings, signal: AbortSignal) {
    return this.session(settings, signal, async client => {
      const { tools } = await client.listTools({}, { signal, timeout: 15000 })
      return tools.filter(tool => supported.has(tool.name)).map(tool => {
        assertValueBudget(tool.inputSchema, 65536)
        return { name: tool.name, description: (tool.description ?? '').slice(0, 4000), inputSchema: tool.inputSchema as JsonValue, schemaHash: contentHash(canonicalJson(tool.inputSchema as JsonValue)) }
      })
    })
  }
  async call(settings: Settings, name: string, args: Record<string, JsonValue>, signal: AbortSignal) {
    if (!supported.has(name)) throw new Error('Этот инструмент MCP не поддерживается безопасным файловым подключением.')
    const grant = settings.tools.find(tool => tool.name === name)
    if (!grant) throw new Error('Инструмент MCP не разрешён в этом подключении.')
    return this.session(settings, signal, async (client, files) => {
      const { tools } = await client.listTools({}, { signal, timeout: 15000 }), tool = tools.find(tool => tool.name === name)
      if (!tool || contentHash(canonicalJson(tool.inputSchema as JsonValue)) !== grant.schemaHash) throw new Error('Контракт инструмента MCP изменился. Проверьте и заново разрешите его.')
      const input = name === 'write_file' ? z.strictObject({ path: z.string(), content: z.string().max(1_000_000) }).parse(args) : z.strictObject({ path: z.string() }).parse(args)
      const path = files.path(input.path, name === 'write_file')
      // The official server enforces its allowed directory too; callers only supply relative paths.
      if (name === 'read_text_file') files.read(input.path)
      if ('content' in input && typeof input.content === 'string' && Buffer.byteLength(input.content) > 1_000_000) throw new Error('Файл превышает 1 МБ.')
      const result = await client.callTool({ name, arguments: { ...input, path } }, undefined, { signal, timeout: 30000 })
      assertValueBudget(result)
      if (result.isError) throw new Error('Файловый MCP-инструмент отклонил операцию.')
      return result as JsonValue
    })
  }
}
