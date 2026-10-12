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

import { utilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'

export interface RuntimeState { status: 'starting' | 'ready' | 'unavailable' | 'stopped'; message: string; pid?: number; damaged: { id: string; message: string }[] }
interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
const rendererCommands = new Set(['submit', 'list', 'get', 'cancel', 'resume', 'remove', 'answer'])

/** The private UtilityProcess channel is not exposed to arbitrary renderer IPC. */
export class RuntimeHost {
  private child?: Electron.UtilityProcess
  private state: RuntimeState = { status: 'stopped', message: '', damaged: [] }
  private pending = new Map<string, Pending>()
  private startup?: Promise<void>
  constructor(private readonly script: string, private readonly directory: string, private readonly notify: (message: unknown) => void, private readonly redact: (message: string) => string = value => value) {}
  snapshot(): RuntimeState { return structuredClone(this.state) }
  private change(status: RuntimeState['status'], message: string, damaged = this.state.damaged) {
    this.state = { status, message: this.redact(message), damaged: damaged.map(item => ({ ...item, message: this.redact(item.message) })), ...(this.child?.pid ? { pid: this.child.pid } : {}) }
    this.notify({ kind: 'service', ...this.snapshot() })
  }
  async start(): Promise<void> {
    if (this.startup) return this.startup
    if (this.child) throw new Error('Предыдущий runtime ещё не завершился.')
    this.change('starting', 'Запуск фонового сервиса…', [])
    let child: ReturnType<typeof utilityProcess.fork>
    try { child = utilityProcess.fork(this.script, [this.directory], { serviceName: 'Workflow Architect Runtime', stdio: 'ignore' }) }
    catch (error) { this.change('unavailable', 'Не удалось запустить фоновый процесс. Переподключитесь для повторной попытки.'); throw error }
    this.child = child
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('Runtime не подтвердил готовность.')); child.kill() }, 15000)
      child.on('message', (value: unknown) => {
        if (this.child !== child || !value || typeof value !== 'object') return
        const message = value as Record<string, unknown>
        if (message.version !== '0.3.1') return
        if (message.kind === 'ready') {
          clearTimeout(timer)
          const damaged = Array.isArray(message.damaged) ? message.damaged.filter((item): item is { id: string; message: string } => !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.message === 'string').slice(0, 500) : []
          this.change('ready', '', damaged); resolve()
        } else if (message.kind === 'unavailable' && typeof message.message === 'string') {
          clearTimeout(timer); this.change('unavailable', message.message.slice(0, 4000)); reject(new Error(message.message.slice(0, 4000)))
        } else if (message.kind === 'changed' && typeof message.jobId === 'string' && typeof message.profileId === 'string') {
          this.notify({ kind: 'changed', jobId: message.jobId, profileId: message.profileId })
        } else if (message.kind === 'reply' && typeof message.requestId === 'string') {
          const waiting = this.pending.get(message.requestId)
          if (!waiting) return
          this.pending.delete(message.requestId); clearTimeout(waiting.timer)
          if (message.ok === true) waiting.resolve(message.result)
          else waiting.reject(new Error(typeof message.message === 'string' ? message.message.slice(0, 4000) : 'Ошибка runtime.'))
        }
      })
      child.once('exit', code => {
        clearTimeout(timer)
        if (this.child !== child) return
        this.child = undefined
        const error = new Error(`Runtime завершился (код ${code}). История сохранена; переподключитесь для восстановления.`)
        for (const waiting of this.pending.values()) { clearTimeout(waiting.timer); waiting.reject(error) }
        this.pending.clear()
        if (this.state.status !== 'stopped') this.change('unavailable', error.message)
        reject(error)
      })
    })
    this.startup = ready
    try { await ready }
    catch (error) { this.change('unavailable', error instanceof Error ? error.message : 'Не удалось запустить runtime.'); throw error }
    finally { this.startup = undefined }
  }
  async reconnect(): Promise<RuntimeState> {
    if (this.state.status === 'ready') return this.snapshot()
    if (this.startup) { await this.startup; return this.snapshot() }
    if (this.child) await this.terminate()
    await this.start()
    return this.snapshot()
  }
  request(value: unknown): Promise<unknown> {
    if (!value || typeof value !== 'object' || !('kind' in value) || typeof value.kind !== 'string' || !rendererCommands.has(value.kind)) return Promise.reject(new Error('Недопустимая команда runtime.'))
    // Full strict schemas are checked in the owning process before any action.
    if (JSON.stringify(value).length > 24 * 1024 * 1024) return Promise.reject(new Error('Команда runtime слишком велика.'))
    return this.send(value)
  }
  private send(command: unknown): Promise<unknown> {
    if (!this.child || this.state.status !== 'ready') return Promise.reject(new Error(this.state.message || 'Фоновый сервис недоступен.'))
    if (this.pending.size >= 32) return Promise.reject(new Error('Слишком много одновременных запросов runtime.'))
    const requestId = randomUUID(), child = this.child
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        this.change('unavailable', 'Runtime не отвечает. Переподключитесь, чтобы проверить сохранённое состояние.')
        reject(new Error('Нет подтверждения runtime. Результат команды неизвестен; проверьте сохранённую историю перед повтором.'))
      }, 15000)
      this.pending.set(requestId, { resolve, reject, timer })
      try { child.postMessage({ version: '0.3.1', requestId, command }) }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error instanceof Error ? error : new Error('Канал runtime недоступен.')) }
    })
  }
  async closeWindow() { if (this.state.status === 'ready') await this.send({ kind: 'close-window' }); else if (this.child) await this.terminate() }
  async wake() { if (this.state.status === 'ready') await this.send({ kind: 'wake' }) }
  async stop() {
    try { if (this.state.status === 'ready') await this.send({ kind: 'stop' }) }
    finally { this.change('stopped', 'Сервис остановлен.'); if (this.child) await this.terminate() }
  }
  private async terminate() {
    const child = this.child
    if (!child) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Предыдущий runtime ещё не подтвердил завершение.')), 5000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
      child.kill()
    })
  }
}
