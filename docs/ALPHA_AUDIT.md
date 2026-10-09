# Alpha v0.1 — аудит готовности

Дата: 8 октября 2026. Источник требований: `Workflow_Architect_v0.1_Specification.md`; исходная спецификация не изменялась.

## Definition of Done §66

| Область | Реализованные пункты | Проверка |
| --- | --- | --- |
| Core | Create/Open, Autosave, Import, Export | `projects.spec.ts`, `persistence*.test.ts`, `switch-project.test.ts`, `export.spec.ts` |
| Canvas | Infinite Canvas, Pan, Zoom, Minimap, Selection/Multi-selection, Drag, Resize, Snap, Undo/Redo | `editor.spec.ts`, `organization.spec.ts`, `session.test.ts`, `adapter.test.ts` |
| Nodes | Concept, Agent, Tool, Trigger, Logic, Data, Human, Artifact, Subworkflow | `engineering.spec.ts`, `serialization.test.ts`, `engineering.test.ts` |
| Graph | Connections, Ports, Edge editing, Labels, Basic contracts | `engineering.spec.ts`, `validate-project.test.ts`, `polish.spec.ts` |
| Organization | Groups, Notes, Search, Alignment | `organization.spec.ts`, `organization.test.ts`, `clipboard.ts`, `SearchDialog.tsx` |
| Inspector | Node, Edge, Group, Project, Multi-selection | `Inspector.tsx` и конфигурационный реестр; engineering/organization/recovery browser scenarios |
| Engineering | Conversion, Agent/Tool config, Schema editor, Validation | `engineering.test.ts`, `engineering.spec.ts`, `validate-project.test.ts` |
| Export | project.json, workflow.json, architecture.md, Codex package | `export.test.ts`, `export.spec.ts`; nested graph round trip |
| Visual quality | Dark tokens, Semantic colors, Hover/Selected/Focus, Motion, Status/Empty states, Responsive panels, Reduced motion | screenshot review и browser checks на 1440×900 / 1100×800; `editor.spec.ts`, `preview.spec.ts`, `polish.spec.ts` |

Все пункты §66 реализованы. Дополнительные детали и принятые границы приведены ниже, чтобы статус Alpha не означал наличие production runtime.

## Проверка применимых требований

- §1–4, 11: Idea → Concept → Engineering → Specification → Export; режим не удаляет/скрывает данные, конвертация сохраняет ID, текст, размер, позицию и связи; undo покрыт тестом.
- §5–9, 14, 17–18, 42–44, 54: пять областей UI, breadcrumb, Preview/Validate/Export/settings, command palette, search, контекстные меню, восемь align/distribute операций, help и shortcuts. Палитра умеет конвертировать выделенные Concept одним batch command. Все node types доступны через библиотеку и палитру, Artifact/Note — также R/M.
- §7, 12–13: Canvas adapter изолирован; zoom-aware карточки; port compatibility проверяется domain helper и подсвечивается при drag. Flow/Data/Tool access/Reference имеют отдельные семантики. Поддержаны informal, JSON Schema и shared references.
- §10, 15–16, 20–21: все node configs, группы/collapse, Group → Subworkflow с binding, Notes, UUID, долговечные draft/configured/ready/disabled и временные Preview running/success; ошибки и предупреждения имеют текстовые индикаторы.
- §22–31: модульные export targets; ZIP/pair/JSON/YAML import, Codex documents, Markdown diagram и Open Questions, validation перед export, warnings не блокируют; semantic errors допускаются в backup snapshots.
- §32–34: empty state с созданием узла, Space, новым проектом и примерами; три demo templates; name/description/mode/grid/snap/motion/export default в Project Inspector.
- §35–36: фокус, native dialog focus trap, keyboard navigation, reduced motion; production profile 100/300 nodes. Результаты и границы замеров — `PERFORMANCE.md`.
- §37–41, 55: strict TS/Zod, отдельные stores, command/patch history, IndexedDB, UUID, schemaVersion, явный отказ от неизвестной версии; Canvas layers и transient UI отделены от durable model.
- §45–50: ограниченные размеры, ручной resize, автовысота по команде с undo; hierarchy карточек, hover/focus/selected, semantic resizer, короткие transitions. Auto height не создаёт фоновую историю при наборе текста.
- §51–53: structural Preview с branches/nested graphs, паузой/шагами; Markdown prompt editor и `.md` download; raw JSON Schema validation/formatting.
- §56–58: partial recovery совместимых полей/сущностей, raw recovery JSON, переход к проблемному элементу, новый ID копии; оригинал не перезаписывается; очевидные secrets отклоняются. Произвольный код не исполняется.
- §59–65, 67–71: будущие runtime/cloud/collaboration/Git/MCP/deployment/billing не реализованы. Codex export — статический implementation package. Этапы выполнялись последовательно, архитектура и ADR отражают решения.

## Архитектурные запреты §68

1. XYFlow импортируется только в `canvas/`, это контролирует ESLint.
2. Domain graph, validator, serializer и exporters не используют Canvas coordinates как business semantics.
3. Prompts находятся в project model; ресурсы и узлы имеют стабильные UUID.
4. Exporters не зависят от React. `ExportDialog` — отдельный потребитель результатов.
5. Inspector использует реестр полей и общие controls.
6. Credentials хранятся как references; нет API calls, eval, workers/runtime, scheduler или secrets vault.
7. Domain snapshot читается независимо от UI; стили задаются собственными tokens.

## Финальная верификация

- `npm run check`: typecheck, lint, 46 unit/integration tests, production build без chunk warnings.
- `npm run test:e2e`: 14 браузерных сценариев на изолированной production-сборке.
- `npm run test:performance`: два сценария 100/300 nodes, production Chromium, drag/pan/zoom/edit/autosave/reload.
- Визуально просмотрены пустой Canvas, engineering Inspector, contracts, группы, nested Canvas, export/error, templates, recovery, Preview/reduced motion и port compatibility. Focus/selection и узкий desktop проверены отдельными сценариями.

## Границы Alpha

- Preview — структурный обход всех ветвей, а не вычисление условий или исполнение workflow.
- Recovery — best effort для распознаваемого JSON 0.1. Неразбираемый JSON и неизвестные версии остаются доступны как исходный файл.
- Метасхемы JSON Schema и ссылки проверяются; полное доказательство совместимости произвольных schemas не выполняется.
- Autosave не гарантирует запись незавершённого debounce при аварии процесса. После «Сохранено» транзакция IndexedDB завершена.
- Clipboard действует в текущей вкладке. Мобильный редактор и обязательное облако отсутствуют.
- Браузерные замеры производительности относятся к проверенной машине; данные большого размера, очень длинные prompts и слабое оборудование требуют отдельного профилирования.
