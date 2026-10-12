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
import { parseCheckpoint, type CheckpointFrame, type RunCheckpoint } from './checkpoint'
import { executeAgentOperation, type ProviderResolver } from './agent-operation'
import { parallelRegion } from './ai-plan'
import { textStatistics } from '../ai/text-tool'
import type { AiUsage } from '../ai/trace-schema'

class RunFailure extends Error {
  constructor(message: string, readonly activation?: Activation) { super(message) }
}
interface Token { nodeId: string; portId?: string; value: JsonValue }
interface Context {
  id: string; graphId: string | null; graph: Graph; path: string[]
  outputs: Map<string, Map<string, JsonValue>>
  data: Map<string, Map<string, JsonValue>>
  loops: Map<string, number>
  queue: Token[]
  activation?: Activation
  human?: CheckpointFrame['human']
}
interface PendingHuman {
  request: HumanRequest; node: WorkflowNode
  resolve(value: JsonValue): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>
}

/** Transport-independent executor; model access is injected only by the trusted host. */
export class ExecutionRun {
  readonly id: string
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
  private frames: Context[] = []
  private restored: CheckpointFrame[] = []
  private resumed = false
  private readonly abort = new AbortController()
  private aiUsage: AiUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0, toolCalls: 0 }
  private reservedTokens = 0
  constructor(plan: ExecutionPlan, private readonly onEvent: (event: RunEvent) => void = () => {}, private readonly persistence: { checkpoint?: unknown; deadline?: number; save?: (checkpoint: RunCheckpoint) => void; provider?: ProviderResolver } = {}) {
    if (!['0.3', '0.4'].includes(plan.planVersion)) throw new Error('Неподдерживаемая версия плана.')
    idSchema.parse(plan.id)
    const verified = compileProject(plan.snapshot, plan.entryNodeId)
    if (!verified.ok) throw new Error(verified.diagnostics.map(issue => issue.message).join('\n'))
    // Recompile at the execution boundary; supplied limits and mutable plan objects are not trusted.
    this.plan = { ...verified.plan, id: plan.id, createdAt: plan.createdAt }
    if (persistence.deadline !== undefined && (!Number.isSafeInteger(persistence.deadline) || persistence.deadline <= 0)) throw new Error('Некорректный deadline запуска.')
    this.id = createId()
    if (persistence.checkpoint !== undefined) {
      const saved = parseCheckpoint(persistence.checkpoint, this.plan)
      if (['succeeded', 'failed', 'cancelled'].includes(saved.status)) throw new Error('Завершённый запуск нельзя возобновить.')
      for (const frame of saved.frames) {
        const graph = frame.graphId === null ? this.plan.snapshot : this.plan.snapshot.subworkflows.find(item => item.id === frame.graphId)
        const operation = graph?.nodes.find(node => node.id === frame.activation?.nodeId)?.operation?.kind
        if (operation === 'agent' || operation === 'parallel') throw new Error('Прерванный запрос ИИ не повторяется автоматически. Проверьте журнал и создайте новый запуск.')
      }
      this.id = saved.runId; this.status = saved.status; this.cancelled = saved.cancelled
      this.sequence = saved.sequence; this.steps = saved.steps; this.deadline = saved.deadline
      this.eventBytes = saved.eventBytes; this.artifacts = saved.artifacts; this.restored = saved.frames
      this.aiUsage = saved.aiUsage ?? this.aiUsage
      this.resumed = true
    }
  }
  getStatus(): RunStatus { return this.status }
  checkClock(): void {
    if (this.started && Date.now() >= this.deadline) this.abort.abort(new Error('Истёк общий timeout запуска.'))
    const waiting = this.pending
    if (waiting && Date.now() >= Math.min(this.deadline, Date.parse(waiting.request.expiresAt))) {
      this.pending = undefined; clearTimeout(waiting.timer)
      waiting.reject(new RunFailure('Истёк timeout ожидания Human, включая время сна ПК.', waiting.request.activation))
    }
  }
  cancel(): void {
    if (['succeeded', 'failed', 'cancelled'].includes(this.status)) return
    this.cancelled = true
    this.abort.abort(new Error('Запуск отменён.'))
    try { if (this.started) this.save() }
    finally { if (this.pending) { const waiting = this.pending; this.pending = undefined; clearTimeout(waiting.timer); waiting.reject(new RunFailure('Запуск отменён.', waiting.request.activation)) } }
  }
  answer(requestId: string, value: unknown): { ok: boolean; message?: string } {
    const waiting = this.pending
    if (this.cancelled || this.status !== 'waiting' || !waiting || waiting.request.id !== requestId) return { ok: false, message: 'Запрос уже закрыт или относится к другому запуску.' }
    if (Date.now() >= Date.parse(waiting.request.expiresAt)) return { ok: false, message: 'Время ответа истекло.' }
    try {
      assertValueBudget(value)
      if (waiting.request.mode === 'approval' && typeof value !== 'boolean') throw new Error('Для подтверждения требуется да или нет.')
      if (waiting.node.type === 'human') this.check(waiting.node.config.response, value)
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
    try {
      // Validation above may reject an answer without closing the question.
      assertValueBudget(value)
      const frame = this.frames.at(-1)
      if (!frame?.human || frame.human.request.id !== requestId) throw new Error('Контрольная точка Human недоступна.')
      frame.human.answer = { value: structuredClone(value) }
      this.emit({ kind: 'human-answer', requestId, value })
      this.save()
    } catch (error) {
      // A failed durable acknowledgement must never let execution continue.
      this.cancelled = true; this.pending = undefined; clearTimeout(waiting.timer)
      waiting.reject(error instanceof Error ? error : new Error(String(error)))
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    this.pending = undefined; clearTimeout(waiting.timer)
    waiting.resolve(structuredClone(value))
    return { ok: true }
  }
  async start(input: unknown): Promise<RunOutcome> {
    if (this.started) throw new Error('Этот запуск уже начат; создайте новый run.')
    this.started = true
    if (!this.resumed) this.deadline = Math.min(Date.now() + this.plan.limits.timeoutMs, this.persistence.deadline ?? Infinity)
    const deadlineTimer = setTimeout(() => this.abort.abort(new Error('Истёк общий timeout запуска.')), Math.max(0, this.deadline - Date.now()))
    let failure: RunOutcome['error']
    try {
      if (!this.resumed) this.changeStatus('queued')
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
      clearTimeout(deadlineTimer)
      if (this.pending) { clearTimeout(this.pending.timer); this.pending = undefined }
    }
    this.save()
    return { runId: this.id, planId: this.plan.id, status: this.status, steps: this.steps, artifacts: structuredClone(this.artifacts), ...(failure ? { error: failure } : {}) }
  }
  private save() {
    if (!this.persistence.save) return
    const records = (values: Context['outputs']) => Object.fromEntries([...values].map(([id, ports]) => [id, Object.fromEntries(ports)]))
    const checkpoint: RunCheckpoint = {
      checkpointVersion: '0.4', aiUsage: this.aiUsage, planId: this.plan.id, runId: this.id, status: this.status,
      cancelled: this.cancelled, sequence: this.sequence, steps: this.steps, deadline: this.deadline,
      eventBytes: this.eventBytes, artifacts: this.artifacts,
      frames: this.frames.map(frame => ({ id: frame.id, graphId: frame.graphId, path: frame.path,
        queue: frame.queue, outputs: records(frame.outputs), data: records(frame.data), loops: Object.fromEntries(frame.loops),
        ...(frame.activation ? { activation: frame.activation } : {}), ...(frame.human ? { human: frame.human } : {}),
      })),
    }
    assertValueBudget(checkpoint, 32 * 1024 * 1024, true)
    this.persistence.save(structuredClone(checkpoint))
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
    if (this.steps > this.plan.limits.maxSteps) throw new RunFailure('Превышен лимит шагов.')
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
    const saved = this.restored[path.length]
    if (saved && (saved.graphId !== graphId || JSON.stringify(saved.path) !== JSON.stringify(path))) throw new Error('Контрольная точка не соответствует вызову.')
    const maps = (values: CheckpointFrame['outputs']) => new Map(Object.entries(values).map(([id, ports]) => [id, new Map(Object.entries(ports))]))
    const context: Context = saved
      ? { id: saved.id, graphId, graph, path, outputs: maps(saved.outputs), data: maps(saved.data), loops: new Map(Object.entries(saved.loops)), queue: saved.queue, activation: saved.activation, human: saved.human }
      : { id: createId(), graphId, graph, path, outputs: new Map(), data, loops: new Map(), queue: [initial] }
    // A restored frame is consumed once; subsequent invocations get fresh local data.
    delete this.restored[path.length]
    this.frames.push(context)
    const queue = context.queue
    if (!saved) this.save()
    while (queue.length) {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      this.guard()
      const token = queue[0]!, node = graph.nodes.find(node => node.id === token.nodeId)
      if (!node || node.status === 'disabled' || !node.operation) throw new Error('Недоступный узел в плане.')
      const continuing = !!context.activation
      const activation: Activation = context.activation ?? { id: createId(), callId: context.id, graphId, nodeId: node.id, path }
      context.activation = activation
      try {
        if (!continuing && ++this.steps > this.plan.limits.maxSteps) throw new Error('Превышен лимит шагов.')
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
        if (!continuing) this.emit({ kind: 'step-start', activation, input: token.value, data: Object.fromEntries(incoming) })
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
        if (result.next) queue.push(...result.next)
        else for (const edge of graph.edges.filter(edge => edge.type === 'flow' && edge.sourceNode === node.id)) {
          const value = ports.get(edge.sourcePort!)
          if (value === undefined || (edge.predicate && !evaluatePredicate(edge.predicate, value, incoming))) continue
          this.check(edge.contract, value)
          if (queue.length > 10000) throw new Error('Превышен лимит ожидающих активаций.')
          queue.push({ nodeId: edge.targetNode, portId: edge.targetPort, value })
        }
        queue.shift(); context.activation = undefined; context.human = undefined
        this.save()
      } catch (error) {
        if (error instanceof RunFailure && error.activation) throw error
        throw new RunFailure(error instanceof Error ? error.message : String(error), activation)
      }
    }
    this.frames.pop()
    return context
  }
  private async executeNode(node: WorkflowNode, token: Token, context: Context, data: ReadonlyMap<string, JsonValue>, activation: Activation): Promise<{ output: JsonValue; ports?: Map<string, JsonValue>; artifact?: RunArtifact; next?: Token[] }> {
    const op = node.operation!, input = token.value
    const routed = (portId: string) => ({ output: input, ports: new Map(node.ports.filter(port => port.direction === 'output' && (port.id === portId || port.kind === 'data')).map(port => [port.id, input])) })
    switch (op.kind) {
      case 'agent': return { output: await this.executeAgent(node, input, context, data, activation, this.abort.signal) }
      case 'text-statistics': {
        if (typeof input !== 'string') throw new Error('Вход инструмента проверки текста должен быть строкой.')
        return { output: textStatistics(input, op.minimumWords) }
      }
      case 'parallel': return this.executeParallel(node, input, context)
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
  private async executeAgent(node: WorkflowNode, input: JsonValue, context: Context, data: ReadonlyMap<string, JsonValue>, activation: Activation, signal: AbortSignal): Promise<JsonValue> {
    if (!this.persistence.provider || node.operation?.kind !== 'agent') throw new Error('Для ИИ требуется Windows-приложение с настроенной локальной моделью.')
    const reserved = Math.min(node.operation.limits.maxTotalTokens, 131072 - this.aiUsage.inputTokens - this.aiUsage.outputTokens - this.reservedTokens)
    if (reserved < 128) throw new Error('Исчерпан общий бюджет ИИ запуска (131072 токена).')
    if (this.deadline - Date.now() < 1000) throw new Error('Недостаточно времени для запроса модели.')
    this.reservedTokens += reserved
    let consumed = 0
    try {
      this.save()
      return await executeAgentOperation({ node, project: this.plan.snapshot, graph: context.graph, input, data, outputs: context.outputs,
        tokenBudget: reserved, timeoutMs: this.deadline - Date.now(), provider: this.persistence.provider, signal,
        trace: trace => {
          this.guard(); signal.throwIfAborted()
          if (trace.kind === 'model-start' && this.aiUsage.calls >= 32) throw new Error('Превышен общий лимит 32 вызовов модели.')
          if (trace.kind === 'tool-start' && this.aiUsage.toolCalls >= 64) throw new Error('Превышен общий лимит 64 вызовов инструментов.')
          if (trace.kind === 'model-start') this.aiUsage.calls++
          if (trace.kind === 'tool-start') this.aiUsage.toolCalls++
          if (trace.kind === 'model-finish') {
            this.aiUsage.inputTokens += trace.inputTokens; this.aiUsage.outputTokens += trace.outputTokens; this.aiUsage.costUsd += trace.costUsd
            const newlyConsumed = Math.min(reserved - consumed, trace.inputTokens + trace.outputTokens)
            consumed += newlyConsumed; this.reservedTokens -= newlyConsumed
          }
          this.emit({ kind: 'ai', activation, trace }); this.save()
          if (this.aiUsage.inputTokens + this.aiUsage.outputTokens > 131072) throw new Error('Превышен общий бюджет ИИ запуска.')
        },
      })
    } finally { this.reservedTokens -= reserved - consumed }
  }
  private async executeParallel(fork: WorkflowNode, input: JsonValue, context: Context): Promise<{ output: JsonValue; next: Token[] }> {
    if (fork.operation?.kind !== 'parallel') throw new Error('Ожидался Parallel.')
    const { agents, join } = parallelRegion(context.graph, fork)
    const forkPorts = new Map(fork.ports.filter(port => port.direction === 'output' && ['flow', 'data'].includes(port.kind)).map(port => [port.id, input]))
    for (const port of fork.ports.filter(port => forkPorts.has(port.id))) this.check(port.contract, input)
    context.outputs.set(fork.id, forkPorts)
    const branchAbort = new AbortController(), signal = AbortSignal.any([this.abort.signal, branchAbort.signal])
    const results: JsonValue[] = new Array(agents.length)
    let cursor = 0
    const work = async () => {
      while (cursor < agents.length) {
        signal.throwIfAborted(); this.guard()
        const index = cursor++, node = agents[index]!
        const activation: Activation = { id: createId(), callId: context.id, graphId: context.graphId, nodeId: node.id, path: context.path }
        try {
          if (++this.steps > this.plan.limits.maxSteps) throw new Error('Превышен лимит шагов.')
          const incoming = new Map(context.data.get(node.id) ?? [])
          const entry = context.graph.edges.find(edge => edge.type === 'flow' && edge.sourceNode === fork.id && edge.targetNode === node.id)!
          this.check(entry.contract, input); this.check(node.ports.find(port => port.id === entry.targetPort)?.contract, input)
          if ('input' in node.config) this.check(node.config.input, input)
          for (const edge of context.graph.edges.filter(edge => edge.type === 'data' && edge.targetNode === node.id)) {
            const value = context.outputs.get(edge.sourceNode)?.get(edge.sourcePort!)
            if (value === undefined) throw new Error('Источник Data параллельной ветви ещё не выполнен.')
            this.check(edge.contract, value); this.check(node.ports.find(port => port.id === edge.targetPort)?.contract, value)
            incoming.set(edge.targetPort!, value)
          }
          for (const [portId, value] of incoming) this.check(node.ports.find(port => port.id === portId)?.contract, value)
          this.emit({ kind: 'step-start', activation, input, data: Object.fromEntries(incoming) })
          const output = await this.executeAgent(node, input, context, incoming, activation, signal)
          this.guard(); signal.throwIfAborted(); assertValueBudget(output)
          if ('output' in node.config) this.check(node.config.output, output)
          const ports = new Map(node.ports.filter(port => port.direction === 'output' && ['flow', 'data'].includes(port.kind)).map(port => [port.id, output]))
          for (const [id, value] of ports) this.check(node.ports.find(port => port.id === id)?.contract, value)
          const exit = context.graph.edges.find(edge => edge.type === 'flow' && edge.sourceNode === node.id)!
          this.check(exit.contract, output); this.check(join.ports.find(port => port.id === exit.targetPort)?.contract, output)
          context.outputs.set(node.id, ports)
          results[index] = { nodeId: node.id, title: node.title, output }
          this.emit({ kind: 'step-finish', activation, output, ports: Object.fromEntries(ports) }); this.save()
        } catch (error) {
          const failure = new RunFailure(error instanceof Error ? error.message : String(error), activation)
          branchAbort.abort(failure); throw failure
        }
      }
    }
    const settled = await Promise.allSettled(Array.from({ length: Math.min(agents.length, fork.operation.concurrency) }, work))
    const failed = settled.find(item => item.status === 'rejected')
    if (failed?.status === 'rejected') throw branchAbort.signal.reason ?? failed.reason
    this.guard()
    return { output: input, next: [{ nodeId: join.id, value: { results } }] }
  }
  private waitForHuman(node: WorkflowNode, activation: Activation): Promise<JsonValue> {
    const op = node.operation
    if (op?.kind !== 'human') throw new Error('Ожидалась операция Human.')
    const frame = this.frames.at(-1)!
    if (frame.human?.answer) {
      const answer = frame.human.answer.value
      if (node.type === 'human') this.check(node.config.response, answer)
      return Promise.resolve(structuredClone(answer))
    }
    return new Promise((resolve, reject) => {
      const previous = frame.human?.request
      const expires = previous ? Date.parse(previous.expiresAt) : Math.min(this.deadline, Date.now() + op.timeoutMs)
      if (Date.now() >= expires) { reject(new RunFailure('Истёк timeout ожидания Human.', activation)); return }
      const request: HumanRequest = previous ?? { id: createId(), activation, question: op.question, mode: op.mode, expiresAt: new Date(expires).toISOString() }
      frame.human = { request }
      const timer = setTimeout(() => { this.pending = undefined; reject(new RunFailure('Истёк timeout ожидания Human.', activation)) }, Math.max(0, expires - Date.now()))
      this.pending = { request, node, resolve, reject, timer }
      try {
        this.changeStatus('waiting')
        if (!previous) this.emit({ kind: 'human-request', request })
        this.save()
      } catch (error) { clearTimeout(timer); this.pending = undefined; reject(error instanceof Error ? error : new Error(String(error))) }
    })
  }
}
