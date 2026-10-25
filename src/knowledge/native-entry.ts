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

import { dialog } from 'electron'
import { readFile, stat, open } from 'node:fs/promises'
import { KnowledgeService } from './service'
import { KnowledgeError, scanSource } from './importer'
import { knowledgeCommandSchema } from './schema'
import { assertValueBudget } from '../execution/values'

export function createNativeKnowledge(directory: string) {
  const service = new KnowledgeService(directory)
  let pending = Promise.resolve<unknown>(undefined)
  async function handle(value: unknown) {
    try {
      assertValueBudget(value, 128 * 1024, true)
      const command = knowledgeCommandSchema.parse(value)
      let result: unknown = null
      switch (command.kind) {
        case 'list': result = await service.list(command.profileId); break
        case 'choose-folder': {
          const selection = await dialog.showOpenDialog({ title: 'Подключить папку базы SOAR', properties: ['openDirectory', 'dontAddToRecent'] })
          result = selection.canceled ? null : selection.filePaths[0]; break
        }
        case 'scan': result = await scanSource(command.sourcePath); break
        case 'prepare': result = await service.prepare(command); break
        case 'commit': result = service.commit(command.profileId, command.token); break
        case 'preview-document': result = service.previewDocument(command.profileId, command.token, command.documentId); break
        case 'inspect': result = service.inspect(command.profileId, command.id, command.snapshotId, command.documentId); break
        case 'enable': case 'prune': case 'remove': service.change(command.profileId, command.id, command.revision, command.kind, command.kind === 'enable' ? command.enabled : undefined); break
        case 'backup': {
          const backup = service.backup(command.profileId, command.id)
          const selection = await dialog.showSaveDialog({ title: 'Сохранить знания — открытый JSON без шифрования', defaultPath: 'soar-knowledge-backup.json', filters: [{ name: 'Knowledge JSON', extensions: ['json'] }], properties: ['dontAddToRecent'] })
          if (selection.canceled || !selection.filePath) break
          // Exclusive creation: never truncate a pre-existing backup on an interrupted write.
          let file
          try { file = await open(selection.filePath, 'wx', 0o600); await file.writeFile(JSON.stringify(backup, null, 2), 'utf8'); await file.sync(); result = true }
          catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new KnowledgeError('Файл уже существует. Для новой резервной копии выберите новое имя.'); throw error }
          finally { await file?.close() }
          break
        }
        case 'restore': {
          const selection = await dialog.showOpenDialog({ title: 'Восстановить знания как отдельную коллекцию', properties: ['openFile', 'dontAddToRecent'], filters: [{ name: 'Knowledge JSON', extensions: ['json'] }] })
          if (selection.canceled || !selection.filePaths[0]) break
          const path = selection.filePaths[0]
          if ((await stat(path)).size > 28 * 1024 * 1024) throw new KnowledgeError('Резервная копия превышает 28 МБ.')
          const buffer = await readFile(path)
          if (buffer.byteLength > 28 * 1024 * 1024) throw new KnowledgeError('Резервная копия превышает квоту.')
          result = service.restore(command.profileId, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer))); break
        }
      }
      return { ok: true, value: result }
    } catch (error) {
      return { ok: false, message: error instanceof KnowledgeError ? error.message : 'Не удалось обработать базу. Проверьте доступ к папке, формат JSON и свободное место. Рабочая коллекция не заменена.' }
    }
  }
  return { handle(value: unknown) { const next = pending.then(() => handle(value)); pending = next.catch(() => undefined); return next } }
}
