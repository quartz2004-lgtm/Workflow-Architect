# Реализованная архитектура

## Состояние

Версия 0.4.0: [план и приёмка](V0.4.0_PLAN.md), [ADR 0012](decisions/0012-local-model-boundary.md). Состояние публикации и установщик — в GitHub Releases.

### Добавления 0.4.0

Изолированное ядро `ai/`: провайдерные типы, Ollama с фиксированным numeric loopback, ограниченным чтением ответа и отказом от redirect/cloud; agent loop проверяет capabilities, контекст, токены, расходы, время и число вызовов. Structured output проверяется интерпретатором контрактов. Отмена блокирует поздний ответ даже при некорректном провайдере. Чистый Tool считает слова, абзацы и Markdown-заголовки; он не выполняет фактчекинг.

Для модели инструменты имеют короткие семантические имена; разрешения по-прежнему привязаны к UUID узлов. Выбор инструментов и финальный JSON разделены: JSON grammar не подавляет tool calls, включая необязательные инструменты. При пропуске обязательного инструмента или недостаточной длине разрешено по одному исправлению с обратной связью; прежние лимиты вызовов, токенов и времени не сбрасываются. Исправление не выполняет инструмент от имени модели. Финальная JSON-фаза запрещает дальнейшие tool calls. Версия интерфейса и HTML-альманаха берётся из package.json.

Новые проекты используют **schemaVersion 0.3**, новые планы — **planVersion 0.4**. Заморожены схемы 0.1 и 0.2; цепочка миграций сохраняет точные исходные байты до первого преобразования. Импорт 0.2 не принимает новые операции под старой версией. Архивные snapshot 0.2 и планы 0.3 читаются для истории runtime. Copy/paste переназначает также joinNodeId. Новые checkpoint имеют версию 0.4 и накопленный aiUsage; старые 0.3.1 читаются.

Операция Agent использует существующие role/prompt/model/behavioralRules/context/output. Контекст включает явные Data-входы и выбранные уже исполненные узлы. Память `run` — только последний результат этого Agent в данном вызове графа. Tool требует одновременно Tool access и явный toolIds allowlist; неизвестные параметры, свободные permissions и неподдерживаемые внешние подключения блокируют компиляцию. Встроенный text-statistics может вызываться агентом или получать строку через Flow. Требование вызвать каждый разрешённый инструмент и минимум слов проверяются после генерации.

Parallel задаёт joinNodeId и concurrency 1–4: от 2 до 8 самостоятельных ветвей, каждая — один Agent, затем общий Merge. Компилятор запрещает посторонние входы, условные выходы и зависимости ветвей друг от друга. Executor ограничивает параллельность и сводит результаты **один раз**, в порядке связей, с nodeId и title. При ошибке отменяет остальные ветви. Обычный Merge вне Parallel сохраняет прежний pass-through. Общие лимиты ИИ запуска: 32 запроса модели, 64 инструмента, 131072 токена, плюс лимиты каждого Agent и общий deadline. Параллельные активации резервируют токенный бюджет, чтобы не расходовать его независимо.

`ConnectionStore` в utility process сохраняет настройки отдельно в `runtime/ai-connections`, по двум profile IDs. ModelProvider выдаётся только владельцу включённого подключения с совпадающей моделью; изменение/отключение отзывает захваченные провайдеры и активные запросы. Renderer не получает HTTP-proxy. `AssistantService` запускает краткоживущие задачи проверки подключения, проектирования и персонализации через ограниченный IPC; UI опрашивает результат, поэтому длительная генерация не блокирует служебные запросы. Задачи отменяются при закрытии окна; максимум один активный помощник и десять результатов на профиль. Схемы предложений не содержат credentials/permissions, сервис не имеет методов изменения проекта или настроек UI.

Журнал содержит model/tool start/finish, длительность, токены и стоимость. Прерванная активация Agent/Parallel не повторяется автоматически: требуется просмотр журнала и новый запуск. Фоновые задания с ИИ пока консервативно требуют такого решения после остановки сервиса; завершённые результаты остаются в истории. Браузерный Worker не получает модельного адаптера и явно отказывает только ИИ-операциям.

`AiMenu/AiWorkbench` лениво загружают три раздела: подключение, проектирование, персонализация. Поля Inspector используют существующие команды и общие controls/FieldHelp. Помощник только добавляет проверенный фрагмент через одну batch-команду; неизменность исходного объекта проекта и активного графа проверяется перед применением. Tool grants выключены по умолчанию, включаются отдельным флажком с перечнем пар Agent → Tool. Новые IDs создаёт приложение, а не модель. Полный набор узлов и связей валидируется; циклы предложения отклоняются.

Персонализация принимает анкету и текст пробной задачи; schema разрешает только реальные предпочтения интерфейса. Выбор карточки меняет локальный draft, применение отдельно вызывает версионированный ProfileRepository.save. Первая исходная конфигурация сохраняется до изменения в отдельной IndexedDB `workflow-architect-ai-preferences`, по profile ID, и восстанавливается после перезапуска. Ни проекты, ни credentials, ни разрешения инструментов этот путь не меняет.

Готовый `article-example` содержит ручной Trigger, автора, редактора с обязательным разрешённым Tool и Markdown Artifact. Оба Agent требуют минимум 600 слов. Встроенный подсчёт слов не является проверкой фактов. Desktop-тест с локальным контролируемым сервером проверяет реальный IPC, capabilities, preview, явные grants, batch undo, применение/возврат настроек; он дополняет, но не заменяет приёмку настоящей модели.

Ядро локального выполнения, введённое в 0.3.0: [план и приёмка](V0.3.0_PLAN.md), [ADR 0010](decisions/0010-local-execution-boundary.md). `domain/execution-config.ts` описывает декларативные операции и ссылки на стабильные ID портов; `execution/values.ts` обрабатывает JSON без eval, `execution/contracts.ts` интерпретирует ограниченное подмножество JSON Schema. Неподдержанные ограничения отвергаются, размеры и сложность ограничены. Формат проекта 0.2 сохраняет optional node.operation и edge.predicate; команды и copy/paste сохраняют операции и переназначают ссылки на порты, не меняя JSON-литералы.

`execution/compiler.ts` создаёт frozen serializable ExecutionPlan версии 0.3 с новым ID, выбранным корневым ручным Trigger и полной копией проекта. Структурные ошибки дополнены проверками исполнимости: поддержанные операции, явные порты, раздельные исходы условий, отсутствие текстовых expressions, поддержанные контракты, однозначность Data, привязки Subworkflow. Cycles без выхода тела ограниченного Loop отклоняются алгоритмом удаления входящих рёбер (Kahn). Reference не активирует узлы, Tool access блокируется до появления Agent/Tool. Ограничения компиляции: 1000 узлов, 5000 связей, 100 графов и консервативная оценка JSON до 16 MiB.

`execution/executor.ts` — транспорт-независимый ExecutionRun: собственный run ID, повторная компиляция на границе исполнения, отдельный контекст каждого Subworkflow, очередь Flow-активаций в порядке связей и последние Data-выходы только текущего вызова. Data читается по стабильному ID входного порта через value source вида data. Merge пропускает каждую поступившую активацию, не является барьером ожидания параллельных workers. Вложенный вызов обрабатывается до следующей активации родителя. Открытые выходы берутся только с реально выполненных внутренних портов; пропущенная ветка не выдаёт результат.

Ядро выполняет manual/map/if/switch/loop/merge/human/artifact/subworkflow. Human выдаёт request ID, проверяет ответ, сохраняет waiting при невалидном вводе; cancel и timeout закрывают запрос, поздний ответ отвергается. Отказ approval завершает run с ошибкой. Артефакт содержит фактический JSON или текст, пока без автоматического доступа к файловой системе. События передаются копиями; внешний observer не изменяет данные выполнения. Ошибка включает activation, node, graph, call и путь вложенности.

Лимиты ядра: 10000 шагов, глубина вызовов 24, общий timeout 5 минут (включая Human), ожидающие активации до 10000; JSON ограничен по глубине 64 и консервативной оценке размера 2 MiB, событие — 4 MiB, журнал — 16 MiB / 25000 событий. Преобразование проверяет объём после каждого поля, до разрастания результата. Ядро уступает event loop между активациями для отмены.

`execution/worker.ts` компилирует и исполняет snapshot в отдельном module Web Worker. `protocol.ts` валидирует команды/ответы strict Zod-схемами и ограничивает JSON до рекурсивного разбора. `controller.ts` создаёт новый Worker на каждый запуск, проверяет job/run IDs и порядок событий, обрабатывает crash/messageerror, останавливает Worker по отмене или watchdog (310 секунд вместе с подготовкой). Run store отделён от editor history и persistence. При смене проекта текущий run сохраняет свой snapshot; фокус диагностики другого проекта отключён. Это браузерный путь: закрытие вкладки прекращает запуск. В Windows с 0.3.1 используется native controller и долговечный сервис, описанный ниже.

`OperationInspector` использует общие редакторы литералов, источников и предикатов; изменения проходят configure-node/edit-edge и undo. Создание операции сохраняет старые описательные поля: конфликт диагностируется, а не удаляется молча. `RunPanel` показывает входы/выходы, Human, диагностику, журнал по 50 событий и артефакты; длинные значения сокращены только в предпросмотре. Явное сохранение использует существующий download/Save As, без нового Electron IPC. Исполнимый пример включает обе ветви, изолированный Subworkflow, Human и локальный JSON-файл.

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
- `editor/ui-commands.ts`: общий реестр действий клавиатуры, палитры и контекстного меню, включая доступность по текущему выделению, истории и буферу. Перед исполнением доступность проверяется заново. `editor/shortcuts.ts` разрешает физические клавиши с учётом области ввода; текст, диалоги и нативное нажатие кнопок сохраняют свои команды. Изменения графа по-прежнему проходят через domain commands и history.
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

## Профили и первая настройка (разработка 0.2.0)

`profiles/` содержит отдельную Zod-модель, IndexedDB repository, локальные правила рекомендаций и UI настройки. Мастер запускается до рабочего пространства для нового профиля; его практика не использует project store. Пропуск сохраняет исходные настройки. Можно повторить мастер либо отредактировать предпочтения вручную. Рекомендации учитывают опыт, ручное управление, результат практики и интересы для избранных примеров; модель и сеть не используются.

`ProfileProvider` хранит активный профиль отдельно от editor stores. Сохранение сначала подтверждается repository; revision защищает от конкурентной перезаписи. Настройки меняют плотность библиотеки/Inspector, раскрытие технических разделов, reduced motion, режим новых пустых проектов и порядок шаблонов. Будущие лимиты пока только предпочтения. Переключение ждёт autosave, затем меняет активный профиль и перезагружает окно для чистого lifecycle редактора. Конфликт блокирует переключение, оставляя правки в редакторе. Общие проекты и индивидуальный последний проект описаны в [ADR 0009](decisions/0009-local-profiles.md).

## Desktop shell: реализация

Реализация 0.3.1: `runtime/atomic-store.ts` предоставляет отдельное файловое хранилище с атомарной заменой и квотами; `execution/checkpoint.ts` и `ExecutionRun` поддерживают проверенные сериализуемые контрольные точки очереди, вложенных вызовов, результатов, Loop и Human. Desktop Run UI использует native bridge и отдельный runtime, браузерный Run сохраняет Worker вкладки. Архитектурное решение — [ADR 0008](decisions/0008-background-runtime.md).

`runtime/job-manager.ts` связывает исполнитель с долговечными заданиями: snapshot/вход/профиль/согласие на фон, дедупликация eventKey, ограничение параллельности, атомарное сохранение событий и checkpoint, отмена, классификация прерванных записей и ограниченное восстановление. Изменение публикуется подписчику после записи. Ошибка хранения останавливает сервис; повреждённые записи остаются доступными для диагностики и не исполняются.

`runtime/utility-entry.ts` собирается отдельным CJS bundle (`runtime-dist/runtime.cjs`) вместе с его production dependencies. `desktop/runtime-host.cts` запускает Electron UtilityProcess; его приватный MessagePort не доступен renderer. Native bridge предоставляет ограниченные runtime request/state/reconnect/subscribe; main проверяет конкретный webContents, главный frame и origin, а процесс проверяет strict command schema и размеры. Reader списка получает краткие summaries; полный snapshot запрашивается для выбранного запуска. При закрытии окна foreground задания отменяются, background продолжаются; tray открывает редактор, задаёт opt-in автозапуск при входе в Windows и выполняет полный выход с сохранением. `powerMonitor.resume` проверяет абсолютные deadlines. Это не Windows system service и не обещание работы до входа пользователя в Windows.

`execution/view-state.ts` задаёт общую проекцию Run UI. Desktop controller принимает профиль при создании editor session, проверяет входящие snapshots, подписывается на изменения и обновляет историю с ограниченной частотой. При скрытой панели запрашиваются только summaries. Отключение или размонтирование view не отменяет сервисное задание. Generation/selection guards отбрасывают ответы устаревших запросов; повтор неподтверждённой отправки использует прежний eventKey. Интерфейс показывает подтверждённую отмену, состояние связи, историю профиля, продолжение прерванного запуска и явное удаление истории. Разрешение на фон задаётся отдельно для каждого нового запуска и фиксируется в задании, вне Project.

Windows-приложение использует тот же production React build внутри изолированного Electron renderer. `desktop/main.cts` обслуживает локальные ресурсы через `workflow://app`, управляет окном и native Save As. `desktop/preload.cts` раскрывает close/save handshake и ограниченный runtime API; `src/platform/desktop.ts` связывает handshake с существующим autosave. Native типы не попадают в domain/editor/export.

JSON-метасхемы Ajv компилируются заранее в `src/validation/generated`, что позволяет запретить eval в CSP. Протокол закрыт для внешних запросов, навигации и разрешений. NSIS устанавливает приложение для текущего пользователя. Детали и компромиссы: [ADR 0005](decisions/0005-windows-desktop.md), [инструкция Windows](DESKTOP.md).

## Durable model

Самостоятельный JSON-снимок содержит `schemaVersion: "0.2"`, `project`, `nodes`, `edges`, `groups`, `schemas`, `prompts`, `subworkflows`, `settings`.

`domain/legacy-schema.ts` фиксирует прежнюю strict-схему 0.1. Миграция 0.1 → 0.2 меняет только версию и не назначает исполняемых операций по старым текстовым описаниям. Чтение списка проектов проверяет старую схему без преобразования. Открытие/импорт и adoption записывают исходный snapshot в отдельную backup DB до преобразования; CAS сохранения сравнивает исходную запись, включая гонки во время миграции. Импорт JSON сохраняет исходный текст, YAML и пары/ZIP — собранный JSON snapshot до изменения версии; исходные внешние файлы не перезаписываются. Recovery обоих форматов создаёт отдельный проект, сохраняет исходный raw в отчёте и не принимает новые execution-поля из повреждённого документа, объявленного как 0.1.

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
- `preferences`: active-project:<profile UUID> → UUID проекта; прежний active-project используется только как начальный выбор первого профиля.

Snapshot и active ID записываются одной транзакцией. Autosave debounce 450 ms, записи сериализованы; изменения во время записи приводят к следующей записи свежей ревизии. Ошибка не стирает рабочий проект; retry доступен в UI. При уходе документа в hidden выполняется flush, однако асинхронная запись не обещает сохранение последнего незавершённого изменения при аварии процесса.

ManagedProjectRepository добавляет list/load по ID, сохраняя минимальный интерфейс autosave. Переключение проекта выполняется после flush текущего проекта; failure не позволяет потерять несохранённые правки. При открытии новой session history/selection сбрасываются, Canvas перемонтируется. Импорт сначала показывает preview/diagnostics, затем открывается как самостоятельный snapshot. Если UUID проекта уже занят, меняется только UUID новой импортированной копии и её название; исходный проект не перезаписывается. IDs сущностей внутри копии сохраняются.

Внешний snapshot ограничен 64 MiB; локальные snapshots читаются без этой переносимой квоты. Оба пути проверяют версию и strict Zod-схему. Незнакомая версия не приводится молча к 0.1. При повреждении JSON 0.1 `recoverProject` собирает совместимые поля/сущности и отчёт; открытие восстановленной копии — явное действие пользователя. Копия получает новый project ID и сохраняется отдельно. Recovery store не входит в durable snapshot. Исходный JSON и проблемные записи доступны в отчёте; исходный локальный проект остаётся в repository. Подробнее — [ADR 0004](decisions/0004-recovery-and-preview.md) и [ADR 0008](decisions/0008-storage-evolution-and-conflicts.md).

## Preview и examples

Три demo templates создаются domain factories с новыми UUID при каждом открытии. Engineering examples намеренно не назначают невыбранную пользователем модель и показывают соответствующие warnings. Automation Concept остаётся лёгким Concept graph.

Preview строит структурный обход Flow/Data, входит во вложенные графы, показывает branches и посещает каждый узел не более одного раза, включая циклы. Notes и disabled исключены. Conditions не вычисляются, инструменты не запускаются. Controller поддерживает pause/resume/step/stop; reduced motion начинает с паузы. Любой commit останавливает Preview. Никакие Preview steps/statuses не попадают в project/history/autosave.

Settings поддерживают optional exportDefault; отсутствие поля означает archive. Старые snapshots 0.1 не требуют миграции. Настройка, как и другие persistable значения, проходит commands/history.

## Защищённые подключения 0.3.1

`src/credentials/` отделяет схемы metadata/commands, атомарный vault, redactor и UI. `desktop/credentials-host.cts` загружает фиксированный main-only bundle; renderer имеет только list/create/set-enabled/remove/copy-reference/status. Асинхронный Windows DPAPI защищает ciphertext на диске. Начиная с 0.5 доверенный runtime-адаптер получает секрет на время запроса по отдельному private utility/main каналу; renderer этого метода не имеет. Владение профилем и ревизия permission проверяются при каждом внутреннем resolve. Секреты и история находятся вне экспортируемого проекта. Подробности — [ADR 0011](decisions/0011-profile-credentials.md) и [ADR 0013](decisions/0013-native-integrations-and-durable-sources.md).

## Интеграции 0.5

`src/integrations/` содержит чистые схемы/каталог/протокол UI отдельно от native-хранилищ, broker и адаптеров HTTP, файлов, Telegram и MCP. Connection UUID и декларативные field mappings входят в domain operation; секреты, разрешённые корни и права остаются в native profile configuration. Executor принимает ConnectorExecutor, а Agent получает только Tool, явно разрешённые через список UUID и Tool access. Поля, настроенные в Tool, фиксированы относительно аргументов модели.

SourceStore сохраняет опубликованные неизменяемые snapshots, чат-привязки и интервальные расписания. TelegramInbox регистрирует событие до подтверждения offset; JobManager дедуплицирует запуск по bot/update или schedule/slot. EffectStore сохраняет намерение до внешней записи, результат — после подтверждения. Неопределённые исходы видны в UI и не повторяются автоматически. MCP SDK и официальный файловый сервер поставляются в native CJS bundles, без runtime npm install. См. [ADR 0013](decisions/0013-native-integrations-and-durable-sources.md).

## Альманах

`src/help/content.ts` — единый источник 31 главы справки. Lazy-loaded `Almanac.tsx` отображает одну главу, оглавление и полнотекстовый поиск; состояние чтения локально компоненту и не попадает в project/history. `html.ts` формирует экранированный автономный HTML без scripts и внешних ресурсов, с оглавлением и стилями печати. `npm run docs:almanac` создаёт `docs/Workflow_Architect_Almanac.html` из тех же данных; desktop-сборка обновляет документ автоматически.

Кнопка «Альманах», `?` и F1 открывают справку. F1 доступен из поля ввода, Canvas-команды не активны внутри диалога. Общий Modal восстанавливает фокус после закрытия, включая вложенные окна. Тесты проверяют полнотекстовый поиск, пустой результат, переходы, HTML-export всего справочника, фокус и компактное окно; отдельный desktop-сценарий проверяет сохранение HTML штатным механизмом Electron.

## Верификация

Unit/integration tests покрывают все типы при round trip, version handling, ссылки/порты/циклы/duplicate IDs, секреты, команды/группы/конвертацию/patch history, адаптер, IndexedDB и гонки autosave. Playwright проверяет рабочий цикл Canvas и damaged-project boot. Все зависимости фиксируются lockfile.

Дополнительно проверены boundary conversion с внешними contracts, scoped undo/navigation, collapse projections, deep duplicate/remapping, references между подсистемами, каскадное удаление exposed ports, alignment и переход к вложенному узлу через поиск. Browser checks охватывают движение группы, сворачивание, конвертацию, reload, palette/clipboard/context menus и клавиатуру.

Exporters потребляют только domain model. Вложенные графы входят во все форматы, а ZIP/pair/YAML round trip проверяется автоматически. Инженерные errors блокируют archive/Markdown/Codex, snapshots допускают semantic diagnostics. Импорт ZIP ограничивает compressed/expanded size, entries и пути; YAML запрещает aliases и неизвестные tags. Подробности — ADR 0003. Экспорт и импорт загружаются по требованию. Файловый MCP добавлен в 0.5; живая Codex integration пока не реализована; локальный runtime 0.3 описан выше; Codex получает статический implementation package. Полноэкранный редактор prompts использует CodeMirror с Markdown syntax highlighting и загружается по требованию.

## Первичные API references

Реализация controlled Canvas следует [React Flow API](https://reactflow.dev/api-reference/react-flow); независимые stores — [Zustand createStore](https://zustand.docs.pmnd.rs/reference/apis/create-store); discriminated unions и strict schemas — [Zod API](https://zod.dev/api).

Метасхемы и отдельные экземпляры валидатора для dialects — [Ajv JSON Schema](https://ajv.js.org/json-schema.html). Совместимость портов проверяется одним domain helper в команде и в [React Flow isValidConnection](https://reactflow.dev/api-reference/types/is-valid-connection).

Архивы используют [fflate](https://github.com/101arrowz/fflate), включая streaming Unzip и async compression. YAML работает через [yaml parseDocument/stringify](https://eemeli.org/yaml/).

## Развитие 0.2.0-alpha.1

Чтение IndexedDB отделено от квот внешнего импорта, при общей runtime-валидации: [ADR 0006](decisions/0006-local-snapshots-and-keyboard-scopes.md). Boot, список и выбор проектов используют deserializeStoredProject. Физические клавиши работают независимо от раскладки; Ctrl+F/K доступны из текстовых полей. Duplicate использует только текущее выделение и сохраняет clipboard.

Каталог field-help.ts связывает устойчивые ключи UI с текстом и главой справки. FieldHeading/FieldHelp общие для всех Inspector-контролов; popover находится в native top layer. uiStore.helpChapter содержит только временную навигацию. Подробности и coverage — [ADR 0007](decisions/0007-contextual-field-help.md). Domain schema остаётся 0.1.

Порядок веток, выпусков, CI и следующая очередь — [DEVELOPMENT.md](DEVELOPMENT.md). Существующий ALPHA_AUDIT описывает историческое состояние v0.1, текущие изменения — CHANGELOG.
