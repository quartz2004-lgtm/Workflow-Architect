import type { Project } from '../domain/schema'
import { agentDocumentation, architectureMarkdown, contractDocumentation, prose, toolDocumentation } from './markdown'
import { allNodes } from './resources'
import type { ExportFiles } from './package-format'

export function codexFiles(project: Project): ExportFiles {
  const nodes = allNodes(project)
  return {
    'ARCHITECTURE.md': architectureMarkdown(project),
    'AGENTS.md': `# Agent specifications\n\nПроект: ${prose(project.project.name)}. Это описание проектируемых агентов.\n\n${agentDocumentation(project)}\n`,
    'TOOLS.md': `# Tools\n\n${toolDocumentation(project)}\n`,
    'CONTRACTS.md': `# Contracts\n\n${contractDocumentation(project)}\n`,
    'IMPLEMENTATION_PLAN.md': `# Implementation plan

## What to build

${prose(project.project.name)}

${prose(project.project.description) || 'Уточнить цель проекта перед реализацией.'}

## Components

${nodes.map(node => `- ${prose(node.title)} · ${node.type} · ${node.id} · ${node.status}`).join('\n') || 'Компоненты ещё не определены.'}

## Required

- Прочитать ARCHITECTURE.md, AGENTS.md, TOOLS.md, CONTRACTS.md и каноническую пару JSON.
- Сохранить ID и семантику портов, связей и boundary bindings вложенных графов.
- Проверить входные/выходные контракты и явно обработать fallback/error policies.
- Согласовать все незаполненные поля и вопросы из ARCHITECTURE.md перед соответствующей реализацией.
- Использовать credential references и переменные окружения; не включать реальные секреты в проект.

## Excluded unless separately specified

- Не выводить поведение из координат, цветов и Notes.
- Не считать Concept готовым агентом и не исполнять произвольные выражения автоматически.
- Не добавлять deployment, production scheduler, distributed workers, billing, OAuth, облачную синхронизацию или collaboration только на основании этого пакета.
- Пакет описывает проектируемую систему и сам не запускает модели или инструменты.

## Sequence

1. Разрешить открытые вопросы; выбрать технологии и границы будущей реализации.
2. Реализовать и проверить CONTRACTS.md и shared schemas.
3. Создать адаптеры инструментов с тестовыми ответами и явной передачей credentials.
4. Реализовать обязанности агентов, промпты, input/output и permissions.
5. Соединить узлы по типам связей; учесть ветвления и вложенные границы.
6. Проверить happy path, fallback, timeout и invalid input тестами.
7. Отдельно согласовать среду запуска; документировать результат.
`,
    'TASKS.md': `# Engineering tasks

- [ ] Разобрать Open Questions из ARCHITECTURE.md; не заменять неизвестные требования догадками.
- [ ] Покрыть contracts и schemas проверками входов и выходов.
${nodes.filter(node => node.type !== 'note').map(node => `- [ ] ${node.type === 'concept' ? 'Формализовать Concept' : node.status === 'disabled' ? 'Уточнить необходимость отключённого компонента' : 'Реализовать и проверить компонент'} **${prose(node.title)}** (${node.type}, ${node.id}). ${prose(node.description)}`).join('\n')}
- [ ] Проверить все Flow/Data/Tool access/Reference связи и Subworkflow bindings.
- [ ] Покрыть ошибки инструментов, fallback и недостающие данные.
- [ ] Обновить документацию по фактической реализации.
`,
  }
}
