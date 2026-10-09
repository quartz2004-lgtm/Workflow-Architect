import { z } from 'zod'

export const idSchema = z.uuid()
const text = z.string().max(100_000)
export const positionSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite() })
export const sizeSchema = z.strictObject({ width: z.number().min(180).max(800), height: z.number().min(100).max(1200) })
export const edgeTypeSchema = z.enum(['flow', 'data', 'tool-access', 'reference'])
const jsonObject = z.record(z.string(), z.json())
export const contractSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('informal'), description: text }),
  z.strictObject({ kind: z.literal('json-schema'), schema: z.union([jsonObject, z.boolean()]) }),
  z.strictObject({ kind: z.literal('schema-ref'), schemaId: idSchema }),
])
const io = { input: contractSchema.optional(), output: contractSchema.optional() }
const execution = z.strictObject({
  timeoutMs: z.number().int().positive().optional(), retries: z.number().int().nonnegative().optional(),
  fallbackNodeId: idSchema.optional(), errorPolicy: text.optional(),
})
const portSchema = z.strictObject({
  id: idSchema, name: text, direction: z.enum(['input', 'output']),
  kind: edgeTypeSchema, contract: contractSchema.optional(),
  binding: z.strictObject({ nodeId: idSchema, portId: idSchema.optional() }).optional(),
})
const base = {
  id: idSchema, title: z.string().max(300), description: text, notes: text,
  tags: z.array(z.string().max(100)).max(100),
  links: z.array(z.url({ protocol: /^https?$/ })).max(100),
  position: positionSchema, size: sizeSchema,
  color: z.enum(['neutral', 'violet', 'cyan', 'emerald', 'amber', 'blue', 'rose', 'indigo', 'slate']).optional(),
  status: z.enum(['draft', 'configured', 'ready', 'disabled']),
  ports: z.array(portSchema),
}
export const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('concept'), config: z.strictObject({}) }),
  z.strictObject({ ...base, type: z.literal('note'), config: z.strictObject({ content: text.optional() }) }),
  z.strictObject({ ...base, type: z.literal('agent'), config: z.strictObject({
    role: text.optional(), systemPrompt: text.optional(), promptId: idSchema.optional(),
    behavioralRules: z.array(text).optional(),
    model: z.strictObject({ provider: text, name: text, parameters: jsonObject.optional() }).optional(),
    context: z.strictObject({ memory: text.optional(), knowledge: text.optional(), attachedNodeIds: z.array(idSchema).optional(), policy: text.optional() }).optional(),
    toolIds: z.array(idSchema).optional(), permissions: z.array(text).optional(), ...io, execution: execution.optional(),
  }) }),
  z.strictObject({ ...base, type: z.literal('tool'), config: z.strictObject({
    category: text.optional(), provider: text.optional(), reference: text.optional(), ...io,
    authentication: z.strictObject({ type: z.enum(['none', 'environment', 'credential-ref']), reference: text.optional() }).optional(),
    permissions: z.array(text).optional(),
  }) }),
  z.strictObject({ ...base, type: z.literal('trigger'), config: z.strictObject({
    triggerType: z.enum(['manual', 'webhook', 'schedule', 'event', 'message', 'file', 'api-call']).optional(),
    payload: contractSchema.optional(), source: text.optional(),
  }) }),
  z.strictObject({ ...base, type: z.literal('logic'), config: z.strictObject({
    logicType: z.enum(['if', 'switch', 'router', 'loop', 'merge', 'parallel', 'retry', 'gate']).optional(),
    conditions: z.array(text).optional(), expression: text.optional(),
    branches: z.array(z.strictObject({ id: idSchema, label: text, condition: text })).optional(),
  }) }),
  z.strictObject({ ...base, type: z.literal('data'), config: z.strictObject({
    dataType: z.enum(['json', 'database', 'table', 'file', 'vector-store', 'state', 'memory-store']).optional(),
    schema: contractSchema.optional(), persistence: text.optional(), source: text.optional(),
  }) }),
  z.strictObject({ ...base, type: z.literal('human'), config: z.strictObject({
    interactionType: z.enum(['confirmation', 'approval', 'manual-input', 'review', 'decision']).optional(),
    instruction: text.optional(), response: contractSchema.optional(), execution: execution.optional(),
  }) }),
  z.strictObject({ ...base, type: z.literal('artifact'), config: z.strictObject({
    artifactType: z.enum(['document', 'code', 'image', 'video', 'report', 'dataset', 'file', 'json']).optional(),
    format: text.optional(), schema: contractSchema.optional(), storageTarget: text.optional(),
  }) }),
  z.strictObject({ ...base, type: z.literal('subworkflow'), config: z.strictObject({
    subworkflowId: idSchema.optional(), ...io,
  }) }),
])
export const edgeSchema = z.strictObject({
  id: idSchema, sourceNode: idSchema, targetNode: idSchema,
  sourcePort: idSchema.optional(), targetPort: idSchema.optional(),
  type: edgeTypeSchema, label: text, contract: contractSchema.optional(), condition: text.optional(),
  metadata: z.record(z.string(), z.string()).default({}),
})
export const groupSchema = z.strictObject({
  id: idSchema, title: text, description: text, color: base.color,
  nodeIds: z.array(idSchema), collapsed: z.boolean(), position: positionSchema,
  size: z.strictObject({ width: z.number().min(180).max(100_000), height: z.number().min(100).max(100_000) }),
})
const graph = { nodes: z.array(nodeSchema).max(10_000), edges: z.array(edgeSchema).max(50_000), groups: z.array(groupSchema) }
export const projectSchema = z.strictObject({
  schemaVersion: z.literal('0.1'),
  project: z.strictObject({ id: idSchema, name: z.string().min(1).max(300), description: text, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }),
  ...graph,
  schemas: z.array(z.strictObject({ id: idSchema, name: text, definition: z.union([jsonObject, z.boolean()]) })),
  prompts: z.array(z.strictObject({ id: idSchema, name: text, content: text })),
  subworkflows: z.array(z.strictObject({ id: idSchema, title: text, description: text, ports: z.array(portSchema), ...graph })),
  settings: z.strictObject({ defaultMode: z.enum(['concept', 'engineering']), grid: z.boolean(), snap: z.boolean(), motion: z.enum(['system', 'reduced']), exportDefault: z.enum(['archive', 'json', 'yaml', 'markdown', 'codex']).optional() }),
})

export type Project = z.infer<typeof projectSchema>
export type WorkflowNode = z.infer<typeof nodeSchema>
export type NodeType = WorkflowNode['type']
export type EngineeringType = Exclude<NodeType, 'concept' | 'note'>
export type WorkflowEdge = z.infer<typeof edgeSchema>
export type Group = z.infer<typeof groupSchema>
export type Position = z.infer<typeof positionSchema>
export type Contract = z.infer<typeof contractSchema>
export type Graph = Pick<Project, 'nodes' | 'edges' | 'groups'>
