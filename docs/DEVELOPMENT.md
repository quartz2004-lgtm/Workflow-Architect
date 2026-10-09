# Разработка следующих версий

## История и ветки

`main` хранит проверенное состояние. Работа — короткими `fix/*`, `feature/*` или `development/*` ветками, одно архитектурно цельное изменение на коммит. Перед объединением: review diff, `npm run check`, затронутые browser/desktop сценарии. Не переписывать опубликованную историю и release tags. Сборки, профили и секреты исключены из Git.

Версия приложения находится в package.json/lockfile, формат проекта — в domain schema. Они меняются независимо. Изменение формата требует отдельного ADR, миграций и fixtures старых snapshots. Release tag указывает на проверенный коммит, установщик содержит ту же версию. Базовый тег — `v0.1.1`.

Для внешней резервной копии нужен URL приватного или публичного репозитория, выбранного владельцем. Наличие локального Git не означает наличия удалённой копии. После подключения origin следует отправить main и release tags; дальнейшие изменения проводить через PR и обязательные проверки. Защита ветки настраивается на сервере.

## Проверки и выпуск

1. `npm ci`, `npm run docs:almanac`, `npm run check`.
2. `npx playwright install chromium`, `npm run test:e2e`.
3. На Windows: `npm run desktop:build`, затем `npm run test:desktop` с `DESKTOP_EXECUTABLE`, указывающим на `release/win-unpacked/Workflow Architect.exe`.
4. Для Canvas/state/performance изменений отдельно `npm run test:performance` без параллельной нагрузки. CI-тайминги не заменяют локальный профиль.
5. Проверить интерфейс, focus/hover, компактное окно и сохранение при закрытии. Обновить CHANGELOG, README, архитектуру и при необходимости ADR.
6. Проверить чистоту Git, пометить проверенный коммит тегом. Установщик и checksum хранить как release artifacts, не в Git. Перед обновлением закрыть приложение штатно; не завершать процесс принудительно.

`.github/workflows/verify.yml` запускает typecheck/lint/unit/build и browser suite на Ubuntu, сборку установщика и тесты упакованного Electron на Windows. Установщик сохраняется artifact только для тега или ручного запуска. Разрешения workflow — read-only; автоматической публикации или signing нет. Успешный локальный запуск не означает, что hosted CI уже прошёл.

Actions закреплены по commit SHA, проверенным по официальным репозиториям: [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [upload-artifact](https://github.com/actions/upload-artifact). Обновлять осознанным PR вместе с проверками.

## Границы v0.2

Первая итерация: исправления сохранения/клавиатуры, contextual help и воспроизводимые проверки. Это не заявление о завершении всей v0.2.

Следующая очередь:

- единый реестр UI-команд для palette/keyboard/menu, с явными scopes и доступностью;
- конфликт сохранения одного проекта из нескольких web-вкладок: revision/locking и тесты; не cloud sync;
- политика больших переносимых snapshots и потокового импорта, согласованная с квотами архивов;
- конкретная спецификация Codex integration: входной пакет, обратные изменения, review/apply/undo и ошибки; затем адаптеры, не зависимости domain от SDK;
- перед runtime: согласовать семантику Tool references/Tool-access edges и Logic branches/conditions;
- перед изменением schemaVersion: миграции, fixtures и обратная совместимость.

Технический долг: стоимость повторной полной валидации, web lifecycle/error boundary, отсутствие цифровой подписи установщика, build-only dependency advisories. Оптимизации — после профилирования; обновление зависимостей — отдельным проверяемым изменением. Production runtime, OAuth, облачная синхронизация и исполнение произвольного кода остаются вне этой итерации.
