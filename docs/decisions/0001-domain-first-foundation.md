# ADR 0001: Domain snapshot, Canvas projection и patch history

Статус: принято для Foundation.

## Контекст

Спецификация требует Canvas ⇄ Specification ⇄ Code, progressive formalization и будущую интеграцию с внешними инструментами без привязки модели к Canvas library. Репозиторий изначально содержал только спецификацию и AGENTS.md.

## Решение

1. Хранить самостоятельный versioned domain snapshot. Zod strict schemas — runtime boundary и источник TypeScript types. Различать structural validity и semantic engineering diagnostics.
2. Все persistable изменения выполнять editor commands. Историю хранить Immer patches, не полными копиями состояния приложения.
3. Использовать отдельные vanilla Zustand stores, независимые от React, для проекта/истории/выделения/Canvas/UI.
4. Изолировать XYFlow в `canvas/`. Рабочая проекция и промежуточный drag state не являются durable project.
5. Сохранять snapshot в IndexedDB через repository contract; UI не обращается к IndexedDB напрямую.
6. Различать самостоятельный JSON snapshot и многофайловый export package спецификации. Первый предназначен для round trip/recovery; второй в дальнейшем разделит metadata, workflow и ресурсы посредством dedicated exporters. SchemaVersion распространяется на сериализованные границы.

## Последствия

Domain можно проверять и сериализовать без браузера. Замена Canvas не затрагивает exporter, validator и проект. Внешние инструменты в будущем могут использовать те же команды или прочитать snapshot. Конвертация из Concept не требует удаления/создания ID, поэтому сохраняет связи и доступна undo.

На первом этапе typed engineering configs допускают незаполненные поля: недостающая формализация — diagnostic, а не причина отклонять черновик. Строгий parser отклоняет неизвестные поля и версии, поэтому расширения формата потребуют явного version/migration решения.

Полное structural parsing/semantic validation выполняется на commit, не на каждом кадре drag. Производительность этих границ будет измерена на целевых 100/300 nodes. Partial recovery, метасхема JSON Schema и multi-file export ещё не реализованы.

## Отклонённые варианты

- Сериализовать React Flow objects: переносит library/UI state в durable format.
- Один store для всего: смешивает transient state и project lifecycle.
- Полные snapshots на каждый pointermove: делает историю дорогой и многословной.
- Backend/runtime на старте: не нужен local-first v0.1 и нарушает границы задачи.
