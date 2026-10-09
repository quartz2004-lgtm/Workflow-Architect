# Разработка следующих версий

Глобальная последовательность и расширенная цель 1.0 описаны в [ROADMAP.md](ROADMAP.md). Точный объём 0.2.0 и состояние приёмки фиксирует [V0.2.0_PLAN.md](V0.2.0_PLAN.md). Runtime и интеграции планируются по roadmap и отдельным спецификациям версий.

## История и ветки

`main` хранит проверенное состояние. Работа — короткими `fix/*`, `feature/*` или `development/*` ветками, одно архитектурно цельное изменение на коммит. Перед объединением: review diff, `npm run check`, затронутые browser/desktop сценарии. Не переписывать опубликованную историю и release tags. Сборки, профили и секреты исключены из Git.

Версия приложения находится в package.json/lockfile, формат проекта — в domain schema. Они меняются независимо. Изменение формата требует отдельного ADR, миграций и fixtures старых snapshots. Release tag указывает на проверенный коммит, установщик содержит ту же версию. Базовый тег — `v0.1.1`.

Официальный origin: https://github.com/quartz2004-lgtm/Workflow-Architect. Ветки main и development/0.2.0 опубликованы, hosted CI проверен. Дальнейшие изменения проводить через PR и обязательные проверки; release tags не переписывать. Защита ветки настраивается на сервере.

## Проверки и выпуск

1. `npm ci`, `npm run docs:almanac`, `npm run check`.
2. `npx playwright install chromium`, `npm run test:e2e`.
3. На Windows: `npm run desktop:build`, затем `npm run test:desktop` с `DESKTOP_EXECUTABLE`, указывающим на `release/win-unpacked/Workflow Architect.exe`.
4. Для Canvas/state/performance изменений отдельно `npm run test:performance` без параллельной нагрузки. CI-тайминги не заменяют локальный профиль.
5. Проверить интерфейс, focus/hover, компактное окно и сохранение при закрытии. Обновить CHANGELOG, README, архитектуру и при необходимости ADR.
6. Проверить чистоту Git, пометить проверенный коммит тегом. Установщик и checksum хранить как release artifacts, не в Git. Перед обновлением закрыть приложение штатно; не завершать процесс принудительно.

`.github/workflows/verify.yml` запускает typecheck/lint/unit/build и browser suite на Ubuntu, сборку установщика и тесты упакованного Electron на Windows. Установщик сохраняется artifact только для тега или ручного запуска. Разрешения workflow — read-only; автоматической публикации или signing нет. Успешный локальный запуск не означает, что hosted CI уже прошёл.

Actions закреплены по commit SHA, проверенным по официальным репозиториям: [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [upload-artifact](https://github.com/actions/upload-artifact). Обновлять осознанным PR вместе с проверками.

## Границы 0.2.0

Устойчивость сохранения, общий реестр команд, два локальных профиля, первая настройка и подготовка open-source публикации. Реализованное состояние и незавершённые критерии — в [V0.2.0_PLAN.md](V0.2.0_PLAN.md).

Владелец выбрал GPL-3.0-or-later: LICENSE.txt и уведомление docs/COPYRIGHT_NOTICE.txt. npm run copyright:check включён в check и build; новые исходники и генераторы должны сохранять уведомление. Лицензии зависимостей остаются отдельными. Генератор notices использует lockfile и реальные тексты установленных production packages; npm run notices:check включён в build и CI. При обновлении зависимостей выполните npm run notices:generate и проверьте diff. Неполные данные лицензии останавливают генератор.

Перед runtime отдельно определяются семантика Tool access, Logic, модель исполнения и границы credentials. Технический долг: стоимость полной валидации, web lifecycle/error boundary, цифровая подпись установщика и build-only dependency advisories. Оптимизации следуют за профилированием; обновление зависимостей выполняется отдельным проверяемым изменением.
