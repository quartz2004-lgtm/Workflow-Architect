# ADR 0003: Каноническая пара JSON и производные экспортные файлы

Статус: принято для Export.

## Контекст

§22–30 требуют metadata-only project.json, workflow.json, отдельные agents/tools/prompts/schemas, Markdown, YAML и Codex package. Импорт должен работать как из собственного архива, так и из пары project.json + workflow.json. Inline configs и отдельные файлы создают риск двух источников истины.

## Решение

- Domain snapshot остаётся форматом IndexedDB и самостоятельных JSON/YAML backup. Имя скачиваемого JSON — `project-snapshot.json`, чтобы отличать его от метаданных пакета.
- В пакете `project.json` содержит schemaVersion, id, name, description, createdAt, updatedAt, mode. `workflow.json` содержит schemaVersion и все остальные поля snapshot: nodes, edges, groups, subworkflows, schemas, prompts, settings. Обе части имеют strict runtime schemas. Значение mode должно совпадать с settings.defaultMode.
- Эта пара является единственным источником истины при импорте. Она самодостаточна: отдельные конфигурации, prompt files и Markdown — производные представления для coding agents. README внутри каждого пакета явно объясняет эту границу. Редактирование производных файлов не меняет последующий импорт; для этого нужно изменить канонический граф.
- Отдельные agents/tools имеют schemaVersion и стабильные UUID в именах файлов. Titles не участвуют в построении путей. Agent prompt объединяет shared prompt, если он задан, затем локальные инструкции; исходные значения и ссылки сохранены в workflow.json.
- Экспортёры — независимые функции из domain model. Общие metadata, resources, Markdown и Codex собираются отдельными модулями; React-компонент отвечает только за выбор, предпросмотр и скачивание.
- Перед инженерным экспортом выполняется semantic validation. Errors блокируют archive/Markdown/Codex. Warnings/Notes не блокируют; JSON/YAML snapshots сохраняют structurally valid drafts даже с semantic errors.
- ZIP использует fflate, YAML — yaml. ZIP проверяет пути, повторяющиеся имена и лимиты: 10 MiB входа, 32 MiB распакованного содержимого, 2000 entries. Streaming decode проверяет фактически полученный объём, включая архивы с неверными size headers. YAML aliases запрещены, duplicate keys и неизвестные tags отклоняются. Каждый импорт завершается общим parseProject boundary с проверкой версии, схемы и очевидных секретов.

## Последствия

Обратный импорт не зависит от доступности промптов/конфигураций вне выбранной пары. Сохраняются UI-независимые ID, nested boundaries, геометрия, settings и resources. Не требуется миграция существующих snapshots 0.1: их структура не изменилась.

Импорт произвольных чужих workflow formats, синхронизация edits производных файлов назад в граф и выполнение сгенерированных документов не входят в v0.1. Конфигурации и документация не обещают готовый runtime.

## Проверка

Unit tests: nested graph ZIP/pair round trip, JSON/YAML draft round trip, warnings/errors policy, Codex documents, safe paths, ambiguity/version failures, YAML aliases, secrets и expansion limit. Playwright проверяет preview, скачивание и повторный импорт ZIP/YAML/пары JSON, а также блокировку инженерного экспорта при ошибках.
