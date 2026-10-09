import { stringify } from 'yaml'
import type { Project } from '../domain/schema'
import { parseProject, serializeProject } from '../domain/serialization'
import { validateProject } from '../validation/validate-project'
import { architectureMarkdown } from './markdown'
import { projectPair, type ExportFiles } from './package-format'
import { resourceFiles } from './resources'
import { codexFiles } from './codex'

export type ExportTarget = 'json' | 'yaml' | 'archive' | 'markdown' | 'codex'
export const exportTargets: { id: ExportTarget; label: string; description: string; raw?: boolean }[] = [
  { id: 'archive', label: 'Project archive', description: 'Граф, конфигурации, промпты, схемы и документация в ZIP.' },
  { id: 'json', label: 'JSON snapshot', description: 'Полный проект одним файлом. Подходит для резервной копии.', raw: true },
  { id: 'yaml', label: 'YAML snapshot', description: 'Полный проект в YAML с обратным импортом.', raw: true },
  { id: 'markdown', label: 'Markdown architecture', description: 'Обзор системы, диаграмма, обязанности и контракты.' },
  { id: 'codex', label: 'Codex package', description: 'План реализации, задачи и спецификации для coding agent.' },
]
export function exportFiles(value: Project, target: ExportTarget): ExportFiles {
  const project = parseProject(value)
  if (target === 'json') return { 'project-snapshot.json': serializeProject(project) }
  if (target === 'yaml') return { 'project-snapshot.yaml': stringify(project, { aliasDuplicateObjects: false }) }
  const errors = validateProject(project).filter(issue => issue.severity === 'error')
  if (errors.length) throw new Error(`Engineering export недоступен: ${errors.length} Errors. Исправьте диагностику или сохраните raw snapshot.`)
  if (target === 'markdown') return { 'architecture.md': architectureMarkdown(project) }
  const files = { ...projectPair(project), ...resourceFiles(project), 'docs/architecture.md': architectureMarkdown(project),
    'README.md': `# Workflow Architect project\n\nSchema version: 0.1\n\nИмпортируйте этот ZIP либо project.json + workflow.json вместе. Эта пара содержит весь проект и является единственным источником данных при импорте. Остальные файлы сгенерированы из неё для чтения и реализации; их отдельное редактирование не изменяет импортируемый граф.\n\nJSON snapshot — самостоятельный формат с полем project; package project.json содержит только метаданные. Имена файлов ресурсов основаны на стабильных UUID. В agent prompt-файле shared prompt предшествует локальным инструкциям.\n\nГраф является спецификацией. Архив не запускает инструменты и не включает production runtime. Незавершённые поля перечислены в docs/architecture.md.\n`,
  }
  return target === 'codex' ? { ...files, ...codexFiles(project) } : files
}
