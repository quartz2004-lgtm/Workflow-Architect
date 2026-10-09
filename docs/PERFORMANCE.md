# Production performance — Alpha v0.1

Проверено 8 октября 2026 в локальном Windows-окружении, Chromium Playwright, viewport 1440×900, один worker, production Vite build. Это измерение конкретного окружения, а не универсальная гарантия FPS.

## Методика

`npm run test:performance` собирает приложение и запускает отдельный preview server на 4173. Сценарий создаёт 100 или 300 узлов (каждый четвёртый — Agent, остальные Concept) и n−1 Flow-связей, импортирует проект через UI, находит узел, выполняет drag, pan, zoom и Inspector edit с autosave. Затем reload проверяет сохранность всех узлов и изменённого имени.

Для каждой операции собираются интервалы requestAnimationFrame за двухсекундное окно и записи PerformanceObserver longtask. Импорт измеряется от выбора файла до появления всех DOM nodes. Снимки и исходные metrics.json находятся в `performance-results/` после запуска; папка исключена из Git.

## Результат повторного прогона после Canvas polish

| Узлы / связи | Импорт | Drag p95 / max | Pan p95 | Zoom p95 | Edit + autosave p95 | Long tasks в окнах |
| --- | --- | --- | --- | --- | --- | --- |
| 100 / 99 | 963 ms | 16.7 / 16.8 ms | 16.7 ms | 16.8 ms | 16.7 ms | 0 |
| 300 / 299 | 2879 ms | 16.8 / 50.0 ms | 16.7 ms | 16.7 ms | 16.7 ms | 0 |

На 300 узлах был один увеличенный интервал кадра до 50 ms при drag; p95 остался около частоты 60 Hz. Browser errors не зарегистрированы, autosave/reload прошли. Regression budgets: p95 <34 ms для 100 nodes, <50 ms для 300. Эти допуски ограничивают деградацию в тестовом окружении; они не заменяют интерактивную проверку на целевом оборудовании.

## Реализованные ограничения затрат

- Drag/resize обновляет временную Canvas projection; durable command и validation выполняются при завершении жеста.
- Неизменённые node projections и memoized cards переиспользуются. Zoom-aware карточки скрывают вторичные детали.
- Autosave debounced и сериализует записи, без синхронных filesystem операций.
- Preview — отдельный store; отображение шагов не создаёт историю и записи IndexedDB.
- Export, project import UI и Markdown editor загружаются по требованию.
- Markdown syntax, keymap и paste support используют Markdown parser без вложенных HTML/CSS/JS parsers. Lazy chunk уменьшен с 617.43 kB / gzip 211.32 kB до 436.14 kB / gzip 141.40 kB. Production build проходит без chunk warnings.

Сложные JSON Schemas, десятки тысяч символов на каждом узле, более 300 nodes и слабое оборудование в этот acceptance profile не входят.
