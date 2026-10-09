import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { createEdge, createId, createNode, createProject } from '../domain/factories'
import { createEditor } from '../editor/session'
import { makeGroup } from '../editor/organization'
import { validateProject } from '../validation/validate-project'
import { exportFiles } from './exporters'
import { importPackageFiles, importProjectFiles, importText } from './import-project'
import { createArchive, readArchive } from './archive'
import { projectPair } from './package-format'

function fixture() {
  const p = createProject('Research / Report')
  const agent = createNode('agent'), tool = createNode('tool'), trigger = createNode('trigger')
  if (agent.type !== 'agent' || tool.type !== 'tool') throw new Error('factory')
  const schemaId = createId(), promptId = createId()
  p.schemas.push({ id: schemaId, name: 'Result', definition: { type: 'object' } })
  p.prompts.push({ id: promptId, name: 'Shared', content: 'Check the sources.' })
  agent.title = '../../Research'; agent.description = 'Produce a grounded report.'
  agent.config = { role: 'Researcher', model: { provider: 'Local', name: 'model' }, promptId, systemPrompt: 'Summarize accurately.', toolIds: [tool.id], input: { kind: 'informal', description: 'Research question' }, output: { kind: 'schema-ref', schemaId }, execution: { retries: 2 } }
  tool.config = { category: 'search', reference: 'web-search', authentication: { type: 'environment', reference: 'SEARCH_API_KEY' } }
  p.nodes.push(trigger, agent, tool)
  p.edges.push(createEdge(trigger.id, agent.id, trigger.ports[1]!.id, agent.ports[0]!.id))
  const group = makeGroup(p, [agent.id, tool.id]); p.groups.push(group)
  const editor = createEditor(p)
  editor.execute({ type: 'convert-group', id: group.id })
  return { project: editor.projectStore.getState().project, agent, tool, schemaId }
}

describe('portable exports', () => {
  it('round trips a legacy oversized snapshot through portable JSON and ZIP', async () => {
    const project = createProject('Large portable draft')
    project.nodes = Array.from({ length: 115 }, () => ({ ...createNode(), description: 'x'.repeat(95000) }))
    const json = exportFiles(project, 'json')['project-snapshot.json']!
    expect(new TextEncoder().encode(json).byteLength).toBeGreaterThan(10 * 1024 * 1024)
    expect(importText(json, 'project.json')).toEqual(project)
    expect(importPackageFiles(await readArchive(await createArchive(projectPair(project))))).toEqual(project)
  })
  it('rejects non-portable archive output before compression', async () => {
    await expect(createArchive({ '../escape.txt': 'data' })).rejects.toThrow('путь')
    await expect(createArchive(Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`${i}.txt`, ''])))).rejects.toThrow('2000')
    await expect(createArchive({ 'large.txt': 'x'.repeat(128 * 1024 * 1024 + 1) })).rejects.toThrow('128 MiB')
  })
  it('round trips nested graphs, boundary ports, resources, configs and editor settings through the pair and ZIP', async () => {
    const { project } = fixture()
    const files = exportFiles(project, 'archive')
    expect(JSON.parse(files['project.json']!)).not.toHaveProperty('nodes')
    expect(JSON.parse(files['workflow.json']!).schemaVersion).toBe('0.1')
    expect(importPackageFiles(files)).toEqual(project)
    const zipped = await createArchive(files)
    expect(importPackageFiles(await readArchive(zipped))).toEqual(project)
    const rooted = Object.fromEntries(Object.entries(files).map(([path, value]) => [`workflow-project/${path}`, value]))
    expect(importPackageFiles(rooted)).toEqual(project)
    expect(validateProject(project).some(issue => issue.severity === 'error')).toBe(false)
    expect(importPackageFiles({ ...files, 'docs/architecture.md': 'Edited derived view' })).toEqual(project)
  })
  it('round trips JSON and YAML drafts with semantic errors; blocks engineering outputs only', () => {
    const project = structuredClone(fixture().project)
    project.edges[0]!.targetNode = createId()
    expect(importText(exportFiles(project, 'json')['project-snapshot.json']!, 'project.json')).toEqual(project)
    expect(importText(exportFiles(project, 'yaml')['project-snapshot.yaml']!, 'project.yaml')).toEqual(project)
    for (const target of ['archive', 'codex', 'markdown'] as const) expect(() => exportFiles(project, target)).toThrow('Engineering export')
    const draft = createProject(); draft.nodes.push(createNode('concept'))
    expect(() => exportFiles(draft, 'codex')).not.toThrow()
    expect(exportFiles(draft, 'markdown')['architecture.md']).toContain('[warning]')
  })
  it('produces all Codex documents with actual roles, contracts, prompts and stable safe filenames', () => {
    const { project, agent, tool, schemaId } = fixture()
    const files = exportFiles(project, 'codex')
    for (const name of ['IMPLEMENTATION_PLAN.md', 'ARCHITECTURE.md', 'AGENTS.md', 'TOOLS.md', 'CONTRACTS.md', 'TASKS.md', 'project.json', 'workflow.json']) expect(files[name]).toBeTruthy()
    expect(files['AGENTS.md']).toContain('Researcher')
    expect(files['AGENTS.md']).toContain('Produce a grounded report.')
    expect(files['AGENTS.md']).toContain('Research question')
    expect(files['AGENTS.md']).toContain(tool.id)
    expect(files['AGENTS.md']).toContain('Fallback behavior')
    expect(files['CONTRACTS.md']).toContain(schemaId)
    expect(files[`prompts/${agent.id}.md`]).toBe('Check the sources.\n\nSummarize accurately.')
    expect(files[`tools/${tool.id}.json`]).toContain('SEARCH_API_KEY')
    expect(Object.keys(files).some(name => name.includes('..'))).toBe(false)
    expect(files['ARCHITECTURE.md']).toContain('Boundary bindings:')
    expect(files['TASKS.md']).toContain(agent.id)
  })
  it('imports file selections and rejects mismatched versions, missing pair files and ambiguous roots', async () => {
    const { project } = fixture(), pair = projectPair(project)
    const files = Object.entries(pair).map(([path, text]) => new File([text], path))
    expect(await importProjectFiles(files)).toEqual(project)
    expect(() => importPackageFiles({ 'project.json': pair['project.json']! })).toThrow('workflow.json')
    expect(() => importPackageFiles({ ...pair, 'copy/project.json': pair['project.json']! })).toThrow('ровно один')
    expect(() => importPackageFiles({ ...pair, 'project.json': pair['project.json']!.replace('"0.1"', '"9.0"') })).toThrow('0.1')
    expect(() => importPackageFiles({ ...pair, 'project.json': pair['project.json']!.replace('"concept"', '"engineering"') })).toThrow('не совпадают')
    await expect(importProjectFiles([files[0]!, files[0]!])).rejects.toThrow('повторяются')
  })
  it('rejects unsafe archive paths, duplicate files, expansion limits and malformed YAML', async () => {
    await expect(readArchive(zipSync({ '../project.json': strToU8('{}') }))).rejects.toThrow('путь')
    const small = zipSync({ 'one.json': strToU8('{}') })
    const doubled = new Uint8Array(small.length * 2); doubled.set(small); doubled.set(small, small.length)
    await expect(readArchive(doubled)).rejects.toThrow('повторяющийся')
    await expect(readArchive(zipSync({ 'huge.json': new Uint8Array(129 * 1024 * 1024) }))).rejects.toThrow('128 MiB')
    expect(() => importText('x: &x [1]\ny: *x', 'bad.yaml')).toThrow()
    expect(() => importText('x: 1\nx: 2', 'bad.yaml')).toThrow('YAML')
    const project = createProject(); project.project.description = `sk-${'a'.repeat(24)}`
    expect(() => exportFiles(project, 'codex')).toThrow('секрет')
  })
})
