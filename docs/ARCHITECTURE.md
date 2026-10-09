# Реализованная архитектура

## Состояние

Alpha v0.1: Foundation, Engineering semantics, Canvas organization, Export и Alpha polish завершены. Аудит Definition of Done — [ALPHA_AUDIT.md](ALPHA_AUDIT.md). Продуктовые требования находятся в `Workflow_Architect_v0.1_Specification.md` и не изменялись.

## Зависимости и границы

```text
app / inspector / canvas UI
            ↓
    editor commands + session
            ↓
 domain model ← projectStore
       ↓              ↓
 serialization    persistence coordinator → IndexedDB
       ↓
 semantic validation (также вызывается editor session)
```

- `domain/`: Zod schemas, выведенные TypeScript-типы, UUID-фабрики, сериализация; не импортирует React, Zustand, XYFlow, IndexedDB.
- `validation/`: чистая семантическая проверка domain project; error/warning/info. Не зависит от отображения.
- `editor/commands.ts`: конечный набор изменений над моделью. Команды получают domain-типы, не события UI.
- `editor/session.ts`: vanilla Zustand stores и транзакционные Immer patches. Не зависит от React.
- `canvas/`: единственное место, импортирующее XYFlow; правило ESLint запрещает остальные импорты XYFlow. Адаптер строит временную проекцию узлов/связей и связывает Canvas events с командами.
- `inspector/`: реестр секций/полей всех типов (`fields.ts`), общие controls, редакторы контрактов/портов/ресурсов и lazy Markdown editor. Простые значения применяются через команды при blur; JSON — явным «Применить JSON». Стабильные keys полей предотвращают потерю ввода при инициализации соседнего вложенного поля.
- `persistence/`: repository interface, IndexedDB implementation и независимый autosave coordinator.
- `export/`: модульные metadata/resource/Markdown/Codex exporters и import boundary, ZIP/YAML codecs; отдельные store и lazy UI для выбора формата и предпросмотра.
- `preview/`: bounded structural traversal, controller с отдельным store и панель управления; не runtime.
- `app/`: composition root, панели, lifecycle и команды UI.
- `design-system/`: CSS tokens, семантические акценты, focus/hover/selection, reduced motion.
- `shared/`: скачивание файла браузером.

Для текущего local-first SPA выбраны React, TypeScript strict, Vite, Zustand, Zod, XYFlow. Immer хранит forward/inverse patches; `idb` предоставляет небольшой Promise wrapper над IndexedDB. Сервер и SSR не нужны этому этапу. UI использует собственные CSS variables без готовой dashboard-темы.

## Desktop shell

Windows-приложение использует тот же production React build внутри изолированного Electron renderer. `desktop/main.cts` обслуживает локальные ресурсы через `workflow://app`, управляет окном и native Save As. `desktop/preload.cts` раскрывает только close/save handshake; `src/platform/desktop.ts` связывает его с существующим autosave. Native типы не попадают в domain/editor/export.

JSON-метасхемы Ajv компилируются заранее в `src/validation/generated`, что позволяет запретить eval в CSP. Протокол закрыт для внешних запросов, навигации и разрешений. NSIS устанавливает приложение для текущего пользователя. Детали и компромиссы: [ADR 0005](decisions/0005-windows-desktop.md), [инструкция Windows](DESKTOP.md).

## Durable model

Самостоятельный JSON-снимок содержит `schemaVersion: "0.1"`, `project`, `nodes`, `edges`, `groups`, `schemas`, `prompts`, `subworkflows`, `settings`.

Корневой граф и графы Subworkflow имеют одинаковую структуру nodes/edges/groups. Subworkflow node ссылается на вложенный граф по UUID. Вложенность выражена ссылками, не рекурсивными UI-объектами. Циклы вложенности диагностируются; обычные workflow cycles не запрещаются.

Node — discriminated union по `type`; каждый тип имеет отдельную strict config schema. Поля инженерных черновиков optional, Concept не требует технической конфигурации. Title не служит ключом. Position/size — сохраняемая геометрия представления, не семантика исполнения. Group membership выражена IDs; движения группы меняют координаты её участников атомарно.

Connections сохраняют ID, endpoints, необязательные port IDs, type, label, contract, condition и metadata. Contracts различают informal, inline JSON Schema и shared-schema reference. Статические валидаторы, заранее сгенерированные Ajv, проверяют JSON Schema по метасхеме draft-07 или 2020-12; пользовательская schema не компилируется для исполнения, внешние ссылки не загружаются. Проверка логической совместимости произвольных schemas не заявляется. Смена типа связи атомарно выбирает или создаёт совместимые порты, а undo восстанавливает исходные порты вместе со связью.

Постоянные статусы узлов: draft/configured/ready/disabled. Running/success принадлежат временному Preview overlay; validation отображается отдельными warning/error индикаторами. Credentials представлены только ссылками; неизвестные поля отклоняются, очевидные ключи и private keys блокируются эвристикой. Эвристика не гарантирует распознавание всех секретов в свободном тексте.

Самостоятельный snapshot скачивается как `project-snapshot.json` или YAML. Metadata-only `project.json` и полный `workflow.json` образуют каноническую пару для импорта. Agents/tools/prompts/schemas и Markdown в архиве — производные представления, а не второй источник истины. См. [ADR 0003](decisions/0003-portable-export-package.md).

## State и история

Отдельные stores одной editor session:

| Store | Ответственность |
| --- | --- |
| projectStore | Durable Project и локальный revision counter |
| historyStore | До 200 наборов forward/inverse patches, redo stack |
| selectionStore | IDs выделенных узлов/связей |
| navigationStore | Активный graph ID и breadcrumb path |
| canvasStore | Zoom и видимость minimap |
| uiStore | Ошибка текущего действия |
| validationStore | Domain diagnostics и видимость панели Validate |
| exportStore | Видимость окна, target, busy/error экспорта |
| recoveryStore | Исходный JSON и отчёт восстановления текущей session |
| preview.store | Steps, index, status; временная подсветка графа |
| autosave statusStore | Saved/unsaved/saving/error и ошибка записи |

uiStore также управляет окнами ресурсов/проектов; canvasStore — запросом фокусировки узла. Проекция XYFlow и промежуточные drag/resize значения локальны Canvas. Viewport, selection, history, export status, save status и revision не сериализуются.

Selection также содержит group IDs. Canvas store принимает навигационные команды fit/zoom и координаты центра для добавления узлов; uiStore управляет palette/search/help. `editor/actions.ts` предоставляет общие действия для keyboard/palette/context menus. Clipboard хранится отдельно от project, в WeakMap по editor session.

Вложенные Canvas, открытые порты, scoped history и семантика Group → Subworkflow описаны в [ADR 0002](decisions/0002-subworkflow-boundaries.md). `domain/graphs.ts` предоставляет UI-независимые graph lookup/traversal. Inspector, Canvas и библиотека читают активный граф через один hook; ресурсы и настройки остаются project-wide.

Команда сначала применяется к Immer draft; structural schema и semantic invariants проверяются до commit. Ошибка оставляет проект и history нетронутыми. Допускается поэтапное исправление уже существующих ошибок импортированного snapshot; новая команда не должна добавлять новые структурные ошибки. Undo/redo также инициирует autosave, но не записывает сам себя в историю. После удаления selection очищается от несуществующих IDs.

Во время drag durable state не обновляется на каждом кадре; окончательные позиции записываются одной командой. Resize сохраняет и position, и size, чтобы изменение за верхний/левый угол было обратимым. Автовысота измеряет DOM-копию в Canvas и передаёт результат обычной resize command. Canvas reconciliation сохраняет измерения XYFlow и переиспользует неизменённые node projections; выделение проходит через select changes, без обратного цикла onSelectionChange. Initial fit выполняется после измерения узлов. Полная проверка domain выполняется при завершении действия; [профилирование 100/300 nodes](PERFORMANCE.md) не выявило необходимости в дополнительной сложной оптимизации.

## Persistence и безопасность загрузки

IndexedDB database `workflow-architect`, version 1:

- `projects`: UUID → самостоятельный JSON snapshot;
- `preferences`: active-project → UUID.

Snapshot и active ID записываются одной транзакцией. Autosave debounce 450 ms, записи сериализованы; изменения во время записи приводят к следующей записи свежей ревизии. Ошибка не стирает рабочий проект; retry доступен в UI. При уходе документа в hidden выполняется flush, однако асинхронная запись не обещает сохранение последнего незавершённого изменения при аварии процесса.

ManagedProjectRepository добавляет list/load по ID, сохраняя минимальный интерфейс autosave. Переключение проекта выполняется после flush текущего проекта; failure не позволяет потерять несохранённые правки. При открытии новой session history/selection сбрасываются, Canvas перемонтируется. Импорт сначала показывает preview/diagnostics, затем открывается как самостоятельный snapshot. Если UUID проекта уже занят, меняется только UUID новой импортированной копии и её название; исходный проект не перезаписывается. IDs сущностей внутри копии сохраняются.

При загрузке размер JSON ограничен 10 MiB, затем проверяются версия и strict Zod-схема. Незнакомая версия не приводится молча к 0.1. При повреждении JSON 0.1 `recoverProject` собирает совместимые поля/сущности и отчёт; открытие восстановленной копии — явное действие пользователя. Копия получает новый project ID и сохраняется отдельно. Recovery store не входит в durable snapshot. Исходный JSON и проблемные записи доступны в отчёте; исходный локальный проект остаётся в repository. Подробнее — [ADR 0004](decisions/0004-recovery-and-preview.md).

## Preview и examples

Три demo templates создаются domain factories с новыми UUID при каждом открытии. Engineering examples намеренно не назначают невыбранную пользователем модель и показывают соответствующие warnings. Automation Concept остаётся лёгким Concept graph.

Preview строит структурный обход Flow/Data, входит во вложенные графы, показывает branches и посещает каждый узел не более одного раза, включая циклы. Notes и disabled исключены. Conditions не вычисляются, инструменты не запускаются. Controller поддерживает pause/resume/step/stop; reduced motion начинает с паузы. Любой commit останавливает Preview. Никакие Preview steps/statuses не попадают в project/history/autosave.

Settings поддерживают optional exportDefault; отсутствие поля означает archive. Старые snapshots 0.1 не требуют миграции. Настройка, как и другие persistable значения, проходит commands/history.

## Альманах

`src/help/content.ts` — единый источник 28 глав справки. Lazy-loaded `Almanac.tsx` отображает одну главу, оглавление и полнотекстовый поиск; состояние чтения локально компоненту и не попадает в project/history. `html.ts` формирует экранированный автономный HTML без scripts и внешних ресурсов, с оглавлением и стилями печати. `npm run docs:almanac` создаёт `docs/Workflow_Architect_Almanac.html` из тех же данных; desktop-сборка обновляет документ автоматически.

Кнопка «Альманах», `?` и F1 открывают справку. F1 доступен из поля ввода, Canvas-команды не активны внутри диалога. Общий Modal восстанавливает фокус после закрытия, включая вложенные окна. Тесты проверяют полнотекстовый поиск, пустой результат, переходы, HTML-export всего справочника, фокус и компактное окно; отдельный desktop-сценарий проверяет сохранение HTML штатным механизмом Electron.

## Верификация

Unit/integration tests покрывают все типы при round trip, version handling, ссылки/порты/циклы/duplicate IDs, секреты, команды/группы/конвертацию/patch history, адаптер, IndexedDB и гонки autosave. Playwright проверяет рабочий цикл Canvas и damaged-project boot. Все зависимости фиксируются lockfile.

Дополнительно проверены boundary conversion с внешними contracts, scoped undo/navigation, collapse projections, deep duplicate/remapping, references между подсистемами, каскадное удаление exposed ports, alignment и переход к вложенному узлу через поиск. Browser checks охватывают движение группы, сворачивание, конвертацию, reload, palette/clipboard/context menus и клавиатуру.

Exporters потребляют только domain model. Вложенные графы входят во все форматы, а ZIP/pair/YAML round trip проверяется автоматически. Инженерные errors блокируют archive/Markdown/Codex, snapshots допускают semantic diagnostics. Импорт ZIP ограничивает compressed/expanded size, entries и пути; YAML запрещает aliases и неизвестные tags. Подробности — ADR 0003. Экспорт и импорт загружаются по требованию. MCP, живая Codex integration и runtime не реализуются; Codex получает статический implementation package. Полноэкранный редактор prompts использует CodeMirror с Markdown syntax highlighting и загружается по требованию.

## Первичные API references

Реализация controlled Canvas следует [React Flow API](https://reactflow.dev/api-reference/react-flow); независимые stores — [Zustand createStore](https://zustand.docs.pmnd.rs/reference/apis/create-store); discriminated unions и strict schemas — [Zod API](https://zod.dev/api).

Метасхемы и отдельные экземпляры валидатора для dialects — [Ajv JSON Schema](https://ajv.js.org/json-schema.html). Совместимость портов проверяется одним domain helper в команде и в [React Flow isValidConnection](https://reactflow.dev/api-reference/types/is-valid-connection).

Архивы используют [fflate](https://github.com/101arrowz/fflate), включая streaming Unzip и async compression. YAML работает через [yaml parseDocument/stringify](https://eemeli.org/yaml/).
