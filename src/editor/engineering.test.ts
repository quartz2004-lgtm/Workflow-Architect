import { describe, expect, it } from 'vitest'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { configureNode } from '../domain/configuration'
import { deserializeProject, serializeProject } from '../domain/serialization'
import { connectionProblems } from '../validation/connections'
import { jsonSchemaProblem } from '../validation/json-schema'
import { validateProject } from '../validation/validate-project'
import { createEditor } from './session'

describe('engineering editing', () => {
  it('initializes nested configurations without losing other fields, and remains reversible', () => {
    const editor = createEditor()
    const agent = createNode('agent')
    editor.execute({ type: 'create-node', node: agent })
    const provider = configureNode(agent, 'model.provider', 'Local provider')
    const configured = configureNode(provider, 'model.name', 'model-id')
    editor.execute({ type: 'configure-node', node: configured })
    expect(editor.projectStore.getState().project.nodes[0]!.config).toMatchObject({ model: { provider: 'Local provider', name: 'model-id' } })
    editor.undo(); expect(editor.projectStore.getState().project.nodes[0]!.config).toEqual({})
    editor.redo(); expect(editor.projectStore.getState().project.nodes[0]).toEqual(configured)
    expect(() => configureNode(agent, '__proto__.polluted', true)).toThrow()
    expect(() => configureNode(agent, 'execution.retries', -1)).toThrow()
  })
  it('creates Subworkflow with an addressable graph and removes both via undo', () => {
    const editor = createEditor()
    editor.execute({ type: 'create-node', node: createNode('subworkflow') })
    const p = editor.projectStore.getState().project
    expect(p.subworkflows).toHaveLength(1)
    expect(validateProject(p).map(i => i.code)).not.toContain('broken-subworkflow')
    editor.undo()
    expect(editor.projectStore.getState().project.subworkflows).toHaveLength(0)
    editor.redo()
    expect(editor.projectStore.getState().project.subworkflows).toEqual(p.subworkflows)
  })
  it('changes edge semantics and creates compatible ports atomically', () => {
    const p = createProject()
    const a = createNode('agent'); const b = createNode('tool')
    p.nodes.push(a, b)
    const edge = createEdge(a.id, b.id, a.ports[1]!.id, b.ports[0]!.id)
    p.edges.push(edge)
    const editor = createEditor(p)
    for (const kind of ['data', 'reference', 'tool-access'] as const) {
      editor.execute({ type: 'set-edge-type', id: edge.id, kind })
      const next = editor.projectStore.getState().project
      expect(next.edges[0]!.type).toBe(kind)
      expect(connectionProblems(next, next.edges[0]!)).toEqual([])
      editor.undo()
      expect(editor.projectStore.getState().project.nodes).toEqual(p.nodes)
      expect(editor.projectStore.getState().project.edges).toEqual(p.edges)
    }
    editor.execute({ type: 'set-edge-type', id: edge.id, kind: 'tool-access' })
    expect(() => editor.execute({ type: 'reverse-edge', id: edge.id })).toThrow('Agent')
  })
  it('preserves referenced resource IDs on rename and blocks destructive deletion of used resources', () => {
    const editor = createEditor()
    const schema = { id: createId(), name: 'Request', definition: { type: 'object' } }
    const prompt = { id: createId(), name: 'Instructions', content: '# Instructions' }
    editor.execute({ type: 'save-schema', schema }); editor.execute({ type: 'save-prompt', prompt })
    let agent = configureNode(createNode('agent'), 'input', { kind: 'schema-ref', schemaId: schema.id })
    agent = configureNode(agent, 'promptId', prompt.id)
    editor.execute({ type: 'create-node', node: agent })
    editor.execute({ type: 'save-schema', schema: { ...schema, name: 'Renamed' } })
    expect(validateProject(editor.projectStore.getState().project).filter(i => i.severity === 'error')).toEqual([])
    expect(() => editor.execute({ type: 'delete-schema', id: schema.id })).toThrow('Схема')
    expect(() => editor.execute({ type: 'delete-prompt', id: prompt.id })).toThrow('Prompt')
    const p = editor.projectStore.getState().project
    expect(deserializeProject(serializeProject(p))).toEqual(p)
  })
  it('validates both supported JSON Schema dialects without compiling user code or fetching refs', () => {
    expect(jsonSchemaProblem({ type: 'not-a-type' })).toBeTruthy()
    expect(jsonSchemaProblem({ type: 'object', required: 'wrong' })).toBeTruthy()
    expect(jsonSchemaProblem({ type: 'object', properties: { title: { type: 'string' } } })).toBeNull()
    expect(jsonSchemaProblem({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'array', prefixItems: [{ type: 'string' }] })).toBeNull()
    expect(jsonSchemaProblem({ $schema: 'https://not-supported.example/schema' })).toContain('Поддерживаются')
    expect(jsonSchemaProblem({ $ref: 'https://not-fetched.example/schema' })).toBeNull()
  })
  it('keeps mode/settings reversible without changing graph semantics', () => {
    const p = createProject(); p.nodes.push(createNode())
    const editor = createEditor(p)
    editor.execute({ type: 'edit-settings', changes: { defaultMode: 'engineering', motion: 'reduced' } })
    expect(editor.projectStore.getState().project.nodes).toEqual(p.nodes)
    editor.undo(); expect(editor.projectStore.getState().project.settings).toEqual(p.settings)
  })
})
