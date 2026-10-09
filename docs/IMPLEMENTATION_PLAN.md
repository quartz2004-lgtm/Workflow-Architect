# План первых итераций

План составлен после полного прочтения спецификации, до существенной реализации. Каждая итерация должна завершаться typecheck, lint, релевантными tests и build; видимые изменения требуют browser review.

## 1. Foundation — выполнено

- [x] React/TypeScript/Vite, воспроизводимая установка, проверки.
- [x] UI-независимые модели, UUID, Zod, schemaVersion, version rejection.
- [x] Typed draft configs, graph/ports/contracts/resources/Subworkflows.
- [x] Сериализация и базовая domain validation.
- [x] Разделённые stores и command/patch history.
- [x] XYFlow adapter, Concept/Note Canvas, Flow-связи, общий Inspector.
- [x] Drag/resize/selection, minimap, базовые keyboard shortcuts.
- [x] IndexedDB autosave и повторное открытие последнего проекта.
- [x] Начальные design tokens, пустое состояние, доступные focus states.
- [x] Raw JSON snapshot и защита повреждённых данных от перезаписи.

Критерий этапа: Concept graph можно создать, соединить, изменить, отменить изменения и восстановить из локального хранилища.

## 2. Engineering semantics — выполнено, дальнейшие расширения в этапах 3–5

Зависит от устойчивой модели и команд первого этапа.

- [x] Конфигурационная схема Inspector для всех engineering types.
- [x] UI Concept → Engineering conversion с сохранением полей/портов/связей.
- [x] Четыре типа связей, редактирование контрактов и портов, проверка совместимости типов/направлений портов.
- [x] Shared schemas и prompt editor с Markdown highlighting; JSON Schema meta-validation draft-07/2020-12.
- [x] Панель validation с переходом к узлам/связям корневого графа и инженерными required fields. Вложенная навигация относится к этапу 3.
- [x] Создание и открытие локальных проектов, UI import самостоятельного snapshot с диагностикой и сохранением оригинала при совпадении ID.

Проверено: typecheck, lint, build; 26 unit/integration tests, 6 браузерных сценариев. Визуально просмотрены Canvas с инженерными узлами/контрактами, Agent Inspector, панель validation и менеджер проектов.

## 3. Canvas organization и product quality — выполнено

На момент завершения этапа 3 полная Alpha ещё не была готова; итоговая проверка §66 и применимых требований выполнена после этапа 5.

- [x] UI группировки, перемещение/сворачивание/разгруппирование, Group → Subworkflow с boundary bindings.
- [x] Вложенный Canvas и breadcrumb; scoped commands/history; поиск и diagnostics переходят между графами.
- [x] Palette, context menus, copy/paste/duplicate (включая nested graphs), search/help, базовые и node-creation shortcuts.
- [x] Alignment guides, восемь align/distribute operations, fit selection/project.
- [x] Zoom-aware карточки и семантические статусы, restrained creation feedback, reduced motion и keyboard review.

Проверено: 33 unit/integration tests, 8 браузерных сценариев; typecheck/lint/build. Снимки свёрнутой группы, вложенного Canvas, selection/focus и инженерных панелей просмотрены. Остаточный performance/production review — этап 5.

## 4. Экспорт — выполнено

Зависит от engineering validation и стабильных resource references.

- [x] Отдельные exporters: metadata `project.json`, `workflow.json`, agents/tools/prompts/schemas.
- [x] Archive, JSON/YAML, Markdown architecture, Codex implementation package.
- [x] Import ZIP/YAML/snapshot и `project.json` + `workflow.json` через общий validation/version boundary.
- [x] Engineering errors блокируют engineering export по правилам спецификации; raw snapshot остаётся доступен для recovery.

Проверено: typecheck/lint/build, 38 unit/integration tests, 10 браузерных сценариев. Предпросмотр Codex package и error state визуально проверены. Каноническая пара и производные файлы описаны в ADR 0003.

## 5. Alpha polish — выполнено

- [x] Три demo templates, onboarding, partial recovery с сохранением исходного проекта.
- [x] Архитектурный Preview с branches/nested graphs, pause/step и reduced motion без исполнения инструментов.
- [x] Профилирование production на 100/300 узлах; отделение Markdown parser от лишних языков уменьшило lazy chunk до 436 kB, без build warnings.
- [x] Автовысота, compatible ports, edge edit affordance, palette conversion и export defaults.
- [x] Полная проверка Definition of Done §66 и архитектурных запретов §68: [ALPHA_AUDIT.md](ALPHA_AUDIT.md).

Финальная верификация: typecheck/lint/build, 46 unit/integration tests, 14 browser scenarios на production-сборке и 2 performance scenarios. [Результаты performance](PERFORMANCE.md). Решения recovery/Preview/настроек — ADR 0004.

Runtime, очереди, MCP runtime, облако, Git integration, OAuth и deployment не входят в эти этапы.
