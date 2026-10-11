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

import type { JsonValue } from '../domain/execution-config'
import { createId } from '../domain/factories'
import type { Contract, Graph, WorkflowNode } from '../domain/schema'
import { idSchema } from '../domain/schema'
import { compileProject, resolveContract, type ExecutionPlan } from './compiler'
import { compileContract, type ContractCheck } from './contracts'
import { assertValueBudget, evaluatePredicate, jsonEqual, mapValue, sourceValue } from './values'
import type { Activation, HumanRequest, RunArtifact, RunEvent, RunEventPayload, RunOutcome, RunStatus } from './run-types'

class RunFailure extends Error {
  constructor(message: string, readonly activation?: Activation) { super(message) }
}
interface Token { nodeId: string; portId?: string; value: JsonValue }
interface Context {
  id: string; graphId: string | null; graph: Graph; path: string[]
  outputs: Map<string, Map<string, JsonValue>>
  data: Map<string, Map<string, JsonValue>>
  loops: Map<string, number>
}
interface PendingHuman {
  request: HumanRequest; node: WorkflowNode
  resolve(value: JsonValue): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>
}

/** Transport-independent executor. Operations have no filesystem, shell or network capability. */
export class ExecutionRun {
  readonly id = createId()
  private readonly plan: ExecutionPlan
  private status: RunStatus = 'queued'
  private started = false
  private cancelled = false
  private sequence = 0
  private steps = 0
  private deadline = 0
  private eventBytes = 0
  private artifacts: RunArtifact[] = []
  private pending?: PendingHuman
  private checks = new Map<string, ContractCheck>()
  constructor(plan: ExecutionPlan, private readonly onEvent: (event: RunEvent) => void = () => {}) {
    if (plan.planVersion !== '0.3') throw new Error('Неподдерживаемая версия плана.')
    idSchema.parse(plan.id)
    const verified = compileProject(plan.snapshot, plan.entryNodeId)
    if (!verified.ok) throw new Error(verified.diagnostics.map(issue => issue.message).join('\n'))
    // Recompile at the execution boundary; supplied limits and mutable plan objects are not trusted.
    this.plan = { ...verified.plan, id: plan.id, createdAt: plan.createdAt }
  }
  getStatus(): RunStatus { return this.status }
  cancel(): void {
    if (['succeeded', 'failed', 'cancelled'].includes(this.status)) return
    this.cancelled = true
    if (this.pending) { const waiting = this.pending; this.pending = undefined; clearTimeout(waiting.timer); waiting.reject(new RunFailure('Запуск отменён.', waiting.request.activation)) }
  }
  answer(requestId: string, value: unknown): { ok: boolean; message?: string } {
    const waiting = this.pending
    if (this.cancelled || this.status !== 'waiting' || !waiting || waiting.request.id !== requestId) return { ok: false, message: 'Запрос уже закрыт или относится к другому запуску.' }
    if (Date.now() >= Date.parse(waiting.request.expiresAt)) return { ok: false, message: 'Время ответа истекло.' }
    try {
      assertValueBudget(value)
      if (waiting.request.mode === 'approval' && typeof value !== 'boolean') throw new Error('Для подтверждения требуется да или нет.')
      if (waiting.node.type === 'human') this.check(waiting.node.config.response, value)
      this.emit({ kind: 'human-answer', requestId, value })
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
    this.pending = undefined; clearTimeout(waiting.timer)
    waiting.resolve(structuredClone(value))
    return { ok: true }
  }
  async start(input: unknown): Promise<RunOutcome> {
    if (this.started) throw new Error('Этот запуск уже начат; создайте новый run.')
    this.started = true
    this.deadline = Date.now() + this.plan.limits.timeoutMs
    let failure: RunOutcome['error']
    try {
      this.changeStatus('queued')
      assertValueBudget(input)
      this.guard()
      this.changeStatus('running')
      await this.runGraph(null, { nodeId: this.plan.entryNodeId, value: structuredClone(input) }, [], new Map())
      this.guard()
      this.changeStatus('succeeded')
    } catch (error) {
      failure = { ...(error instanceof RunFailure && error.activation ? { activation: error.activation } : {}), message: error instanceof Error ? error.message : String(error) }
      this.emit({ kind: 'failure', ...failure }, true)
      this.changeStatus(this.cancelled ? 'cancelled' : 'failed')
    } finally {
      if (this.pending) { clearTimeout(this.pending.timer); this.pending = undefined }
    }
    return { runId: this.id, planId: this.plan.id, status: this.status, steps: this.steps, artifacts: structuredClone(this.artifacts), ...(failure ? { error: failure } : {}) }
  }
  private changeStatus(status: RunStatus) { this.status = status; this.emit({ kind: 'status', status }, true) }
  private emit(payload: RunEventPayload, terminal = false) {
    if (!terminal) assertValueBudget(payload, 4 * 1024 * 1024, true)
    const event = { ...payload, runId: this.id, sequence: ++this.sequence, timestamp: new Date().toISOString() }
    const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength
    if (!terminal && (this.eventBytes + bytes > 16 * 1024 * 1024 || this.sequence > 25000)) throw new Error('Превышен лимит журнала выполнения (16 MiB / 25000 событий).')
    this.eventBytes += bytes
    this.onEvent(structuredClone(event))
  }
  private guard() {
    if (this.cancelled) throw new RunFailure('Запуск отменён.')
    if (Date.now() >= this.deadline) throw new RunFailure('Истёк общий timeout запуска.')
  }
  private check(contract: Contract | undefined, value: JsonValue) {
    if (!contract || contract.kind === 'informal') return
    const schema = resolveContract(contract, this.plan.snapshot)
    if (schema === undefined) return
    const key = JSON.stringify(schema)
    let validator = this.checks.get(key)
    if (!validator) { validator = compileContract(schema); this.checks.set(key, validator) }
    const issues = validator(value)
    if (issues.length) throw new Error(`Контракт: ${issues.map(issue => `${issue.path} ${issue.message}`).join('; ')}`)
  }
  private async runGraph(graphId: string | null, initial: Token, path: string[], data: Context['data']): Promise<Context> {
    this.guard()
    if (path.length > this.plan.limits.maxDepth) throw new Error('Превышена глубина Subworkflow.')
    const graph = graphId === null ? this.plan.snapshot : this.plan.snapshot.subworkflows.find(graph => graph.id === graphId)
    if (!graph) throw new Error('Вложенный граф не найден.')
    const context: Context = { id: createId(), graphId, graph, path, outputs: new Map(), data, loops: new Map() }
    const queue = [initial]
    for (let index = 0; index < queue.length; index++) {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      this.guard()
      const token = queue[index]!, node = graph.nodes.find(node => node.id === token.nodeId)
      if (!node || node.status === 'disabled' || !node.operation) throw new Error('Недоступный узел в плане.')
      const activation: Activation = { id: createId(), callId: context.id, graphId, nodeId: node.id, path }
      try {
        if (++this.steps > this.plan.limits.maxSteps) throw new Error('Превышен лимит шагов.')
        const incoming = new Map(context.data.get(node.id) ?? [])
        for (const edge of graph.edges.filter(edge => edge.type === 'data' && edge.targetNode === node.id)) {
          const value = context.outputs.get(edge.sourceNode)?.get(edge.sourcePort!)
          if (value === undefined) throw new Error(`Источник Data ${edge.sourceNode} ещё не выдал результат в этом вызове.`)
          this.check(edge.contract, value)
          this.check(node.ports.find(port => port.id === edge.targetPort)?.contract, value)
          incoming.set(edge.targetPort!, value)
        }
        for (const [portId, value] of incoming) this.check(node.ports.find(port => port.id === portId)?.contract, value)
        this.check(node.ports.find(port => port.id === token.portId)?.contract, token.value)
        if ('input' in node.config) this.check(node.config.input, token.value)
        if (node.type === 'trigger') this.check(node.config.payload, token.value)
        this.emit({ kind: 'step-start', activation, input: token.value, data: Object.fromEntries(incoming) })
        const result = await this.executeNode(node, token, context, incoming, activation)
        this.guard()
        assertValueBudget(result.output)
        if ('output' in node.config) this.check(node.config.output, result.output)
        if (node.type === 'data' || node.type === 'artifact') this.check(node.config.schema, result.output)
        const ports = result.ports ?? new Map(node.ports.filter(port => port.direction === 'output' && (port.kind === 'data' || port.kind === 'flow')).map(port => [port.id, result.output]))
        for (const [portId, value] of ports) {
          assertValueBudget(value)
          const port = node.ports.find(port => port.id === portId)
          this.check(port?.contract, value)
          if (node.type === 'subworkflow' && port?.kind === 'flow') this.check(node.config.output, value)
        }
        context.outputs.set(node.id, ports)
        this.emit({ kind: 'step-finish', activation, output: result.output, ports: Object.fromEntries(ports) })
        this.guard()
        if (result.artifact) { this.emit({ kind: 'artifact', artifact: result.artifact }); this.artifacts.push(result.artifact) }
        for (const edge of graph.edges.filter(edge => edge.type === 'flow' && edge.sourceNode === node.id)) {
          const value = ports.get(edge.sourcePort!)
          if (value === undefined || (edge.predicate && !evaluatePredicate(edge.predicate, value, incoming))) continue
          this.check(edge.contract, value)
          if (queue.length - index > 10000) throw new Error('Превышен лимит ожидающих активаций.')
          queue.push({ nodeId: edge.targetNode, portId: edge.targetPort, value })
        }
      } catch (error) {
        if (error instanceof RunFailure && error.activation) throw error
        throw new RunFailure(error instanceof Error ? error.message : String(error), activation)
      }
    }
    return context
  }
  private async executeNode(node: WorkflowNode, token: Token, context: Context, data: ReadonlyMap<string, JsonValue>, activation: Activation): Promise<{ output: JsonValue; ports?: Map<string, JsonValue>; artifact?: RunArtifact }> {
    const op = node.operation!, input = token.value
    const routed = (portId: string) => ({ output: input, ports: new Map(node.ports.filter(port => port.direction === 'output' && (port.id === portId || port.kind === 'data')).map(port => [port.id, input])) })
    switch (op.kind) {
      case 'manual': case 'merge': return { output: input }
      case 'map': return { output: mapValue(op, input, data) }
      case 'if': return routed(evaluatePredicate(op.predicate, input, data) ? op.truePortId : op.falsePortId)
      case 'switch': return routed(op.cases.find(item => jsonEqual(item.value, sourceValue(op.source, input, data)))?.portId ?? op.defaultPortId)
      case 'loop': {
        if (!evaluatePredicate(op.predicate, input, data)) { context.loops.delete(node.id); return routed(op.exitPortId) }
        const count = (context.loops.get(node.id) ?? 0) + 1
        if (count > op.maxIterations) throw new Error(`Превышен лимит итераций Loop (${op.maxIterations}).`)
        context.loops.set(node.id, count)
        return routed(op.bodyPortId)
      }
      case 'human': {
        const response = await this.waitForHuman(node, activation)
        this.guard(); this.changeStatus('running')
        if (op.mode === 'approval' && response === false) throw new Error('Продолжение отклонено пользователем.')
        return { output: op.mode === 'approval' ? input : response }
      }
      case 'artifact': {
        const output = sourceValue(op.source, input, data)
        const content = op.format === 'json' ? JSON.stringify(output, null, 2) : typeof output === 'string' ? output : JSON.stringify(output)
        return { output, artifact: { id: createId(), activation, filename: op.filename, format: op.format, content } }
      }
      case 'subworkflow': {
        if (node.type !== 'subworkflow') throw new Error('Несовместимая операция.')
        const binding = node.ports.find(port => port.id === token.portId)?.binding
        if (!binding) throw new Error('Вход Subworkflow не привязан.')
        const forwarded: Context['data'] = new Map()
        for (const [portId, value] of data) {
          const target = node.ports.find(port => port.id === portId)?.binding
          if (!target?.portId) throw new Error('Вход Data Subworkflow не привязан.')
          const values = forwarded.get(target.nodeId) ?? new Map<string, JsonValue>()
          values.set(target.portId, value); forwarded.set(target.nodeId, values)
        }
        const child = await this.runGraph(node.config.subworkflowId!, { nodeId: binding.nodeId, portId: binding.portId, value: input }, [...context.path, node.id], forwarded)
        const ports = new Map<string, JsonValue>()
        for (const port of node.ports.filter(port => port.direction === 'output' && port.binding)) {
          const value = child.outputs.get(port.binding!.nodeId)?.get(port.binding!.portId!)
          if (value !== undefined) ports.set(port.id, value)
        }
        const flow = node.ports.find(port => port.direction === 'output' && port.kind === 'flow' && ports.has(port.id))
        if (!flow) throw new Error('Subworkflow завершился без результата на открытом Flow-выходе.')
        return { output: ports.get(flow.id)!, ports }
      }
    }
  }
  private waitForHuman(node: WorkflowNode, activation: Activation): Promise<JsonValue> {
    const op = node.operation
    if (op?.kind !== 'human') throw new Error('Ожидалась операция Human.')
    return new Promise((resolve, reject) => {
      const expires = Math.min(this.deadline, Date.now() + op.timeoutMs)
      const request: HumanRequest = { id: createId(), activation, question: op.question, mode: op.mode, expiresAt: new Date(expires).toISOString() }
      const timer = setTimeout(() => { this.pending = undefined; reject(new RunFailure('Истёк timeout ожидания Human.', activation)) }, Math.max(0, expires - Date.now()))
      this.pending = { request, node, resolve, reject, timer }
      this.changeStatus('waiting')
      this.emit({ kind: 'human-request', request })
    })
  }
}
