# Workflow Architect v0.1
## Product & Technical Specification

**Статус:** Alpha specification  
**Версия документа:** 0.1  
**Дата:** 8 октября 2026  
**Продукт:** Workflow Architect  
**Формат:** локально-ориентированный инженерный редактор мультиагентных workflow  

---

# 1. Видение продукта

Workflow Architect — визуальная инженерная среда для проектирования мультиагентных систем, AI-workflow и автоматизаций.

Главная идея продукта:

> **Идея → схема → архитектура → спецификация → реализация**

Пользователь должен иметь возможность начать с простого визуального наброска, как на листе А4, не думая о конкретных моделях, API и инфраструктуре, а затем постепенно превратить этот набросок в формализованную инженерную систему.

Workflow Architect не является просто диаграммным редактором и не является копией n8n.

Его центральная концепция:

> **Canvas ⇄ Specification ⇄ Code**

Canvas служит визуальным представлением системы, но источником истины является машиночитаемая спецификация проекта.

В дальнейшем Workflow Architect должен развиваться в сторону среды, объединяющей подходы:

- Figma — визуальное проектирование;
- n8n — workflow и execution graph;
- IDE — инженерное представление проекта;
- Codex — реализация архитектуры в коде;
- MCP — подключение инструментов;
- Git — версионирование;
- observability — контроль исполнения.

Версия v0.1 не реализует полноценный runtime. Она создаёт фундамент для будущего execution engine.

---

# 2. Главная продуктовая задача v0.1

Создать эстетичный, быстрый и инженерно осмысленный визуальный редактор, в котором можно:

1. Создать проект.
2. Набросать концепцию системы свободными блоками.
3. Создать формальные инженерные узлы.
4. Соединить их связями.
5. Сгруппировать узлы в подсистемы.
6. Настроить свойства агентов и других сущностей.
7. Определить входы и выходы.
8. Сохранить проект.
9. Повторно открыть проект без потери структуры.
10. Экспортировать проект в машиночитаемом формате.
11. Сформировать Markdown-документацию архитектуры.
12. Подготовить проект к дальнейшей реализации через Codex или другой coding-agent.

---

# 3. Принципы продукта

## 3.1. Progressive Formalization

Пользователь не обязан сразу знать техническую реализацию.

Любой проект может начинаться с абстрактных блоков:

```text
Получить задачу
      ↓
Исследовать
      ↓
Создать результат
      ↓
Проверить
```

Позже каждый блок может быть преобразован в инженерную сущность:

- Agent;
- Tool;
- Logic;
- Data;
- Trigger;
- Human;
- Artifact;
- Subworkflow.

Формализация должна происходить постепенно.

---

## 3.2. Visual-first, but specification-driven

Canvas — основной способ взаимодействия человека с проектом.

Однако Canvas не является источником истины.

Источник истины — структурированная модель проекта:

```text
project.json
workflow.json
agents/
prompts/
schemas/
docs/
```

Любое значимое действие на Canvas должно отражаться в модели данных.

---

## 3.3. Engineering before execution

Workflow Architect v0.1 проектирует систему, а не пытается сразу её исполнять.

В версии 0.1 отсутствуют:

- production execution engine;
- distributed workers;
- scheduler;
- полноценная очередь задач;
- marketplace интеграций;
- полноценный secrets vault;
- OAuth-центр;
- масштабируемый runtime;
- production observability.

---

## 3.4. Alpha должна выглядеть как продукт

Функциональность v0.1 может быть ограниченной, но интерфейс не должен выглядеть как прототип.

Обязательные качества:

- аккуратная композиция;
- единая цветовая система;
- продуманные hover/focus/selected states;
- плавные анимации;
- качественные тени;
- градиенты;
- лёгкие glow-эффекты;
- согласованная типографика;
- минимальное визуальное загрязнение;
- хорошие пустые состояния;
- визуально понятная семантика типов узлов.

---

# 4. Основные режимы работы

## 4.1. Concept Mode

Назначение: свободное мышление и проектирование.

Пользователь может создавать простые смысловые блоки без выбора технического типа.

Пример:

```text
[Получить запрос]
       ↓
[Разобрать задачу]
       ↓
[Собрать данные]
       ↓
[Создать результат]
       ↓
[Проверить]
```

Concept Node содержит:

- title;
- description;
- color;
- notes;
- links;
- tags;
- position;
- size.

Для Concept Node не обязательны:

- model;
- provider;
- schema;
- tool;
- retries;
- timeout;
- runtime.

Concept Node можно преобразовать в инженерный узел.

---

## 4.2. Engineering Mode

Назначение: формализация архитектуры.

Здесь каждый узел имеет определённый тип и технические параметры.

Основные типы:

- Agent;
- Tool;
- Trigger;
- Logic;
- Data;
- Human;
- Artifact;
- Subworkflow.

Переключение между Concept Mode и Engineering Mode не должно менять структуру проекта или скрывать данные.

---

# 5. Структура интерфейса

Основной экран:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ WA / Project Name              Saved ●            Preview     Export        │
├────────────┬────────────────────────────────────────────────────┬────────────┤
│            │                                                    │            │
│ NODE       │                                                    │ INSPECTOR  │
│ LIBRARY    │                 INFINITE CANVAS                    │            │
│            │                                                    │            │
│ Agent      │                                                    │            │
│ Tool       │                                                    │            │
│ Logic      │                                                    │            │
│ Data       │                                                    │            │
│ Trigger    │                                                    │            │
│ Human      │                                                    │            │
│ Artifact   │                                                    │            │
│ Group      │                                                    │            │
│            │                                                    │            │
├────────────┴────────────────────────────────────────────────────┴────────────┤
│ 63%      −  +       x:1240 y:830          7 nodes / 8 connections          │
└──────────────────────────────────────────────────────────────────────────────┘
```

Основные области:

1. Top Bar.
2. Node Library.
3. Infinite Canvas.
4. Inspector.
5. Bottom Status Bar.
6. Command Palette.
7. Context Menu.
8. Export Dialog.
9. Project Settings.

---

# 6. Top Bar

Top Bar должен содержать:

### Левая часть

- логотип Workflow Architect;
- название проекта;
- breadcrumb при работе внутри Subworkflow;
- индикатор режима Concept / Engineering.

### Центральная часть

- undo;
- redo;
- save state;
- autosave indicator.

### Правая часть

- Preview;
- Validate;
- Export;
- Project Settings.

Run в v0.1 может присутствовать только как disabled/future capability либо как локальный Preview архитектуры.

Не создавать ложного ощущения production execution.

---

# 7. Canvas

## 7.1. Общие требования

Canvas должен быть бесконечным.

Необходимы:

- pan;
- zoom;
- fit selection;
- fit project;
- multi-select;
- rectangle select;
- drag;
- snap;
- alignment guides;
- keyboard navigation;
- copy;
- paste;
- duplicate;
- delete;
- undo;
- redo.

---

## 7.2. Сетка

Основной фон:

- глубокий холодный графит;
- слабая сетка;
- сетка не должна мешать чтению;
- при zoom-in может становиться немного заметнее;
- при zoom-out часть вторичных линий исчезает.

Пример визуального принципа:

```text
Base background: #0B0D11
Panel background: #11141A
Node surface: #151922
Grid minor: rgba(255,255,255,0.025)
Grid major: rgba(255,255,255,0.045)
```

Точные значения могут быть скорректированы после визуального прототипирования.

---

## 7.3. Zoom levels

### Дальний zoom

Показывать:

- название;
- тип;
- цветовую принадлежность;
- направление связей.

Скрывать:

- metadata;
- tool count;
- model;
- secondary labels.

### Средний zoom

Показывать стандартную карточку.

### Ближний zoom

Можно отображать:

- input/output;
- status;
- model;
- tools;
- schema summary.

---

# 8. Node Library

Левая панель содержит библиотеку узлов.

Разделы:

## Concept

- Concept Node;
- Note;
- Group.

## Engineering

- Agent;
- Tool;
- Trigger;
- Logic;
- Data;
- Human;
- Artifact;
- Subworkflow.

Узел можно:

- drag-and-drop на Canvas;
- создать кликом;
- создать через Command Palette;
- создать горячей клавишей.

---

# 9. Command Palette

Открытие:

- Space;
- Ctrl/Cmd + K;
- double click по пустому Canvas.

Пример:

```text
┌──────────────────────────────────────┐
│ Search nodes, actions, commands...   │
├──────────────────────────────────────┤
│ ✦ Agent                         A    │
│ ⚡ Trigger                      T    │
│ ◇ Tool                         U    │
│ ◆ Logic                        L    │
│ ▣ Data                         D    │
│ ◎ Human                        H    │
│ ◫ Artifact                     F    │
│ ⌘ Subworkflow                  S    │
├──────────────────────────────────────┤
│ Convert selection                  → │
│ Group selection                    → │
│ Export project                     → │
└──────────────────────────────────────┘
```

Command Palette должен стать одним из основных способов работы опытного пользователя.

---

# 10. Типы инженерных узлов

# 10.1. Agent

Назначение: AI-агент или LLM-роль.

Поля:

### Identity

- name;
- description;
- role;
- tags.

### Instructions

- system prompt;
- prompt reference;
- behavioral rules.

### Model

- provider;
- model;
- optional parameters.

### Context

- memory;
- knowledge;
- attached data;
- context policy.

### Tools

- connected tools;
- permissions.

### Contract

- input schema;
- output schema.

### Execution metadata

- timeout;
- retries;
- fallback;
- error policy.

В v0.1 runtime-поля могут сохраняться, даже если ещё не исполняются.

---

# 10.2. Tool

Назначение: внешний или внутренний инструмент.

Примеры:

- Web Search;
- Browser;
- Shell;
- Database;
- HTTP API;
- MCP server;
- Google Drive;
- GitHub;
- Codex;
- custom function.

Поля:

- name;
- description;
- category;
- provider;
- endpoint/reference;
- input schema;
- output schema;
- authentication type;
- permissions;
- notes.

Credentials в v0.1 не должны храниться в открытом виде внутри project.json.

---

# 10.3. Trigger

Типы:

- manual;
- webhook;
- schedule;
- event;
- message;
- file;
- API call.

Поля:

- trigger type;
- payload schema;
- description;
- source;
- future runtime config.

---

# 10.4. Logic

Типы:

- if;
- switch;
- router;
- loop;
- merge;
- parallel;
- retry;
- gate.

Поля:

- logic type;
- conditions;
- expressions;
- branches;
- notes.

---

# 10.5. Data

Типы:

- JSON;
- database;
- table;
- file;
- vector store;
- state;
- memory store.

Поля:

- data type;
- schema;
- persistence type;
- source;
- notes.

---

# 10.6. Human

Назначение:

- confirmation;
- approval;
- manual input;
- review;
- decision.

Поля:

- interaction type;
- question/instruction;
- expected response;
- timeout;
- fallback.

---

# 10.7. Artifact

Представляет конечный или промежуточный результат.

Типы:

- document;
- code;
- image;
- video;
- report;
- dataset;
- file;
- structured JSON.

Поля:

- artifact type;
- format;
- schema;
- storage target;
- description.

---

# 10.8. Subworkflow

Subworkflow — вложенная система.

На основном Canvas отображается как один узел.

Double click открывает внутренний Canvas.

Поддерживается breadcrumb:

```text
Marketing System / Content Pipeline / QA Workflow
```

Subworkflow имеет:

- exposed inputs;
- exposed outputs;
- description;
- internal graph.

---

# 11. Concept Node → Engineering Node

Любой Concept Node должен поддерживать:

```text
Convert to →
Agent
Tool
Trigger
Logic
Data
Human
Artifact
Subworkflow
```

После преобразования:

- position сохраняется;
- dimensions сохраняются;
- title сохраняется;
- description сохраняется;
- существующие связи сохраняются;
- пользователь получает новые технические поля.

Конвертация должна быть reversible через Undo.

---

# 12. Связи

Связь — полноценная сущность.

Она не должна быть просто линией.

Структура связи:

- id;
- sourceNode;
- sourcePort;
- targetNode;
- targetPort;
- label;
- contract;
- condition;
- metadata.

---

## 12.1. Визуальное поведение

Во время создания связи:

1. пользователь начинает drag из port;
2. port увеличивается;
3. линия следует за курсором;
4. совместимые ports подсвечиваются;
5. несовместимые могут приглушаться;
6. после соединения линия мягко фиксируется.

---

## 12.2. Типы связей

В v0.1:

- Flow;
- Data;
- Tool access;
- Reference.

По умолчанию используется Flow.

---

## 12.3. Connection Contract

Для инженерного режима связь может содержать контракт.

Пример:

```yaml
input:
  type: CampaignBrief

output:
  type: ResearchReport
```

Контракт может быть:

- informal;
- JSON Schema;
- reference to shared schema.

---

# 13. Ports

Каждый инженерный узел может иметь:

- input ports;
- output ports;
- tool ports;
- reference ports.

Цвет и форма port могут отражать категорию.

Не перегружать интерфейс: вторичные ports можно скрывать при низком zoom.

---

# 14. Inspector

Inspector — основная правая панель редактирования свойств.

Поведение:

- ничего не выбрано → Project Inspector;
- выбран один node → Node Inspector;
- выбрана connection → Connection Inspector;
- выбрана группа → Group Inspector;
- выбрано несколько элементов → Multi-selection Inspector.

---

## 14.1. Agent Inspector

Структура:

```text
AGENT

Identity
├ Name
├ Description
├ Role
└ Tags

Instructions
├ System prompt
└ Prompt file

Model
├ Provider
├ Model
└ Parameters

Context
├ Memory
├ Knowledge
└ Context rules

Tools
├ Connected tools
└ + Add tool

Contract
├ Input
└ Output

Execution
├ Timeout
├ Retries
└ Fallback
```

Секции должны быть collapsible.

---

# 15. Группы

Group используется для визуальной и логической организации.

Поля:

- title;
- description;
- color;
- contained node ids;
- collapsed state.

При перемещении Group дочерние узлы перемещаются вместе.

Group может быть преобразована в Subworkflow.

---

# 16. Notes

Notes — свободные текстовые заметки.

Используются для:

- объяснения архитектуры;
- TODO;
- гипотез;
- вопросов;
- комментариев.

Notes не участвуют в machine execution.

---

# 17. Minimap

Minimap обязателен для v0.1.

Функции:

- обзор всего graph;
- текущая viewport area;
- click-to-navigate;
- скрытие/показ.

Должен быть визуально ненавязчивым.

---

# 18. Keyboard Shortcuts

Минимальный набор:

```text
Space             Command Palette
Ctrl/Cmd + K      Command Palette
Ctrl/Cmd + Z      Undo
Ctrl/Cmd + Shift+Z Redo
Ctrl/Cmd + C      Copy
Ctrl/Cmd + V      Paste
Ctrl/Cmd + D      Duplicate
Ctrl/Cmd + A      Select all
Delete/Backspace  Delete
G                 Group
F                 Fit project
0                 Reset zoom
+                 Zoom in
-                 Zoom out
Esc               Cancel / deselect
```

Горячие клавиши должны быть доступны в Help overlay.

---

# 19. Визуальная система

# 19.1. Общий стиль

Направление:

- dark engineering UI;
- premium;
- calm;
- precise;
- futuristic without sci-fi overload;
- high information density;
- restrained glow;
- subtle glass;
- clear hierarchy.

Избегать:

- чрезмерной неоновой эстетики;
- кислотных цветов;
- огромных blur;
- дешёвого glassmorphism;
- «AI-purple everywhere».

---

# 19.2. Цветовая семантика

Предварительная система:

```text
Agent       Violet
Tool        Cyan
Trigger     Emerald
Logic       Amber
Data        Blue
Human       Rose
Artifact    Indigo
Subworkflow Slate / Gradient
Concept     Neutral
```

Цвет должен использоваться локально:

- top border;
- icon background;
- small glow;
- port;
- status;
- selected state.

Основная поверхность карточек остаётся нейтральной.

---

# 19.3. Node Surface

Node:

- тёмная поверхность;
- тонкая граница;
- небольшой radius;
- слабая тень;
- внутренний highlight;
- selected ring;
- локальный цветовой accent.

---

# 19.4. Градиенты

Градиенты используются:

- очень дозированно;
- в selected state;
- для Subworkflow;
- в header/icon background;
- в focus glow;
- в empty-state graphics.

Не использовать крупные декоративные градиенты, мешающие Canvas.

---

# 19.5. Тени

Тени должны помогать отделению слоёв.

Пример уровней:

- Canvas: none;
- panel: subtle;
- node: low;
- selected node: medium;
- floating menu: high.

---

# 19.6. Анимации

Все основные UI transitions:

- 120–220 ms.

Создание node:

```text
opacity 0 → 1
scale 0.96 → 1
```

Selected:

- border transition;
- subtle glow.

Connection created:

- short pulse.

Panel open:

- slide + fade.

Delete:

- quick fade + scale down.

Не использовать бессмысленные continuous animations.

---

# 20. Статусы узлов

Даже без runtime система должна поддерживать визуальный status model.

Статусы:

- Draft;
- Configured;
- Ready;
- Running;
- Success;
- Warning;
- Error;
- Disabled.

В v0.1 Running/Success могут использоваться в Preview/Demo mode.

---

## Draft

- muted;
- reduced emphasis.

## Configured

- normal.

## Ready

- small readiness indicator.

## Running

- animated border glow;
- pulse along outgoing edge.

## Success

- brief confirmation pulse;
- return to neutral state.

## Warning

- amber indicator.

## Error

- red status mark;
- error state visible, но карточка не становится полностью красной.

## Disabled

- reduced opacity.

---

# 21. Project Model

Каждый проект имеет уникальный id.

Минимальная модель:

```json
{
  "project": {},
  "canvas": {},
  "nodes": [],
  "edges": [],
  "groups": [],
  "schemas": [],
  "settings": {}
}
```

---

# 22. Project structure

Экспортируемая структура:

```text
workflow-project/
│
├── project.json
├── workflow.json
│
├── agents/
│   ├── researcher.json
│   └── critic.json
│
├── prompts/
│   ├── researcher.md
│   └── critic.md
│
├── tools/
│   └── web-search.json
│
├── schemas/
│   └── contracts.json
│
├── docs/
│   └── architecture.md
│
└── README.md
```

---

# 23. project.json

Хранит метаданные проекта.

Пример:

```json
{
  "schemaVersion": "0.1",
  "id": "project_uuid",
  "name": "Marketing AI System",
  "description": "",
  "createdAt": "",
  "updatedAt": "",
  "mode": "engineering"
}
```

---

# 24. workflow.json

Пример:

```json
{
  "nodes": [
    {
      "id": "node_researcher",
      "type": "agent",
      "name": "Researcher",
      "position": {
        "x": 480,
        "y": 220
      },
      "size": {
        "width": 280,
        "height": 180
      },
      "configRef": "agents/researcher.json"
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_researcher",
      "target": "node_critic",
      "type": "flow"
    }
  ]
}
```

---

# 25. Agent config

Пример:

```json
{
  "id": "agent_researcher",
  "name": "Researcher",
  "role": "Research specialist",
  "description": "",
  "prompt": {
    "system": "prompts/researcher.md"
  },
  "model": {
    "provider": "",
    "name": ""
  },
  "tools": [],
  "inputSchema": "",
  "outputSchema": "",
  "execution": {
    "timeout": null,
    "retries": 0,
    "fallback": null
  }
}
```

---

# 26. Autosave

Autosave обязателен.

Требования:

- debounce;
- визуальный статус;
- отсутствие блокирующих окон;
- recovery после аварийного закрытия.

Статусы:

```text
Saving...
Saved
Unsaved changes
Save error
```

---

# 27. Local-first подход

Для v0.1 предпочтителен local-first.

Проект должен работать без обязательного облачного аккаунта.

Варианты хранения:

- IndexedDB;
- local project store;
- экспорт на диск.

В будущем:

- cloud sync;
- collaboration;
- shared projects.

---

# 28. Import / Export

## Export Project

Форматы v0.1:

- Workflow Architect project archive;
- JSON;
- YAML;
- Markdown architecture;
- Codex package.

---

## Import

Поддержать:

- собственный project format;
- project.json + workflow.json.

---

# 29. Codex Export

Codex Export — одна из ключевых функций архитектуры v0.1.

Система должна уметь сформировать пакет:

```text
IMPLEMENTATION_PLAN.md
ARCHITECTURE.md
AGENTS.md
TOOLS.md
CONTRACTS.md
TASKS.md
workflow.json
project.json
```

---

## IMPLEMENTATION_PLAN.md

Должен объяснять:

- что строится;
- какие компоненты существуют;
- что является обязательным;
- что не должно быть реализовано;
- порядок реализации.

---

## ARCHITECTURE.md

Содержит:

- обзор системы;
- node graph;
- responsibilities;
- boundaries;
- data flow;
- architecture decisions.

---

## AGENTS.md

Для каждого агента:

- role;
- goal;
- input;
- output;
- tools;
- constraints;
- prompts;
- fallback behavior.

---

## TOOLS.md

Содержит список инструментов и их контракты.

---

## CONTRACTS.md

Содержит input/output contracts и схемы.

---

## TASKS.md

Разбивает реализацию на инженерные задачи.

---

# 30. Architecture Documentation

Workflow Architect должен автоматически генерировать читаемую Markdown-документацию.

Пример структуры:

```text
# Project

## Overview

## System Diagram

## Agents

## Tools

## Data Flow

## Contracts

## Subworkflows

## Open Questions
```

---

# 31. Validation

Перед экспортом система должна выполнять базовую проверку.

Проверки:

- orphan nodes;
- invalid connections;
- missing required fields;
- duplicate ids;
- broken references;
- missing input/output contract;
- empty Subworkflow;
- unresolved Concept Nodes.

Результат:

```text
0 Errors
3 Warnings
2 Notes
```

Warnings не должны блокировать экспорт.

Errors могут блокировать Engineering Export, но не raw project export.

---

# 32. Empty State

Первый запуск не должен показывать пустой страшный Canvas.

В центре:

```text
Start building your workflow

Create your first node
or press Space to open Command Palette
```

Дополнительно:

- New blank project;
- Start from example.

Для v0.1 достаточно 2–3 demo templates.

---

# 33. Demo Templates

## Multi-agent Research

```text
Request
  ↓
Planner
  ↓
Researcher
  ↓
Critic
  ↓
Writer
```

## Content Pipeline

```text
Brief
 ↓
Research
 ↓
Copywriter
 ↓
Editor
 ↓
Artifact
```

## Automation Concept

```text
Webhook
 ↓
Router
 ↓
Agent
 ↓
Human Approval
 ↓
API Tool
```

---

# 34. Project Settings

Поля:

- project name;
- description;
- default mode;
- grid settings;
- snapping;
- animation level;
- export defaults.

---

# 35. Accessibility

Минимальные требования:

- keyboard navigation;
- visible focus;
- semantic contrast;
- не передавать смысл исключительно цветом;
- reduced motion option;
- readable text sizes.

---

# 36. Performance

Цель для v0.1:

- 100 nodes — полностью плавная работа;
- 300 nodes — приемлемая работа;
- zoom/pan должны ощущаться мгновенными;
- drag node не должен лагать;
- autosave не должен блокировать UI.

---

# 37. Suggested Technical Stack

Предварительный стек.

## Frontend

- React;
- TypeScript;
- Vite или Next.js в client-heavy режиме;
- React Flow / XYFlow для Canvas;
- Zustand для state management;
- Zod для схем;
- Tailwind CSS или CSS variables + utility layer;
- Framer Motion для точечных анимаций;
- Radix UI / shadcn-like primitives для интерфейсных контролов.

Приоритет: не превращать UI в стандартный «shadcn dashboard». Компоненты должны получить собственный визуальный язык.

---

## Persistence

v0.1:

- IndexedDB;
- local project export/import.

Можно использовать:

- Dexie.

---

## Desktop future path

Архитектура frontend должна позволять позднее завернуть приложение в:

- Tauri.

Tauri предпочтительнее Electron для будущей desktop-версии, если не появятся ограничения.

---

# 38. State architecture

Рекомендуемые stores:

```text
projectStore
canvasStore
selectionStore
historyStore
uiStore
exportStore
validationStore
```

Нельзя складывать всё состояние приложения в один монолитный store.

---

# 39. Undo / Redo

Undo/Redo должен поддерживать:

- create node;
- delete node;
- move node;
- resize node;
- connect;
- disconnect;
- edit node;
- group;
- ungroup;
- convert node;
- change style.

History желательно строить через command/patch model.

---

# 40. IDs

Все сущности получают устойчивые UUID.

Не использовать название node как primary key.

Пример:

```text
node_01J...
edge_01J...
group_01J...
schema_01J...
```

---

# 41. Schema Versioning

У project format с первой версии должно быть:

```json
{
  "schemaVersion": "0.1"
}
```

Это необходимо для будущих migrations.

---

# 42. Необходимые контекстные меню

Node:

- Edit;
- Duplicate;
- Convert;
- Group;
- Disable;
- Delete.

Edge:

- Edit contract;
- Change type;
- Reverse;
- Delete.

Canvas:

- Add node;
- Paste;
- Select all;
- Fit project.

Group:

- Rename;
- Collapse;
- Convert to Subworkflow;
- Ungroup;
- Delete.

---

# 43. Multi-selection

При выборе нескольких nodes доступны:

- move;
- delete;
- duplicate;
- group;
- align;
- distribute.

---

# 44. Alignment tools

Минимум:

- align left;
- align center;
- align right;
- align top;
- align middle;
- align bottom;
- distribute horizontally;
- distribute vertically.

---

# 45. Node dimensions

Node должен иметь:

- min width;
- max width;
- min height;
- auto height;
- optional manual resize.

Размер не должен ломать layout.

---

# 46. Node visual anatomy

Пример:

```text
╭────────────────────────────────────╮
│ ● AGENT                       READY │
│                                    │
│ Content Researcher                 │
│ Исследует тему и источники         │
│                                    │
│ GPT-5.x              4 tools       │
│                                    │
│ ○ input                   output ○ │
╰────────────────────────────────────╯
```

Секции:

1. Type line.
2. Status.
3. Name.
4. Description.
5. Metadata.
6. Ports.

---

# 47. Visual hierarchy

Приоритет отображения:

1. Node name.
2. Type.
3. Connections.
4. Status.
5. Description.
6. Technical metadata.

Technical metadata не должна конкурировать с архитектурой.

---

# 48. Hover behavior

Node hover:

- border brighter;
- subtle elevation;
- ports appear stronger.

Connection hover:

- line brighter;
- edit affordance appears.

Panel item hover:

- background elevation;
- no aggressive color fill.

---

# 49. Selected behavior

Selected node:

- semantic accent ring;
- soft glow;
- Inspector opens automatically.

Multiple selected:

- common selection outline;
- Inspector changes to multi-mode.

---

# 50. Motion philosophy

Анимация используется только для:

- spatial continuity;
- feedback;
- state change;
- execution preview.

Не использовать декоративную анимацию ради эффектности.

---

# 51. Execution Preview

Полноценного runtime нет, но можно добавить визуальный Preview.

Пользователь нажимает Preview:

1. система проходит graph;
2. подсвечивает nodes по очереди;
3. по edges проходит pulse;
4. branches показываются визуально;
5. ошибки структуры подсвечиваются.

Это не выполнение AI-запросов.

Это архитектурная симуляция.

---

# 52. Inspector Prompt Editor

Для Agent должен быть встроенный текстовый редактор prompt.

Минимум:

- monospace;
- line numbers optional;
- Markdown highlighting;
- expand to fullscreen;
- save as prompt file.

---

# 53. JSON Schema Editor

В v0.1 допустим простой редактор:

- raw JSON Schema;
- validation;
- formatting.

В будущем можно добавить visual schema builder.

---

# 54. Search

Глобальный поиск:

- nodes;
- groups;
- agents;
- tools;
- tags.

Shortcut:

```text
Ctrl/Cmd + F
```

Search result должен позволять перейти к node на Canvas.

---

# 55. Canvas Layers

Минимальная модель слоёв:

```text
Background
Groups
Edges
Nodes
Selection
Floating UI
```

---

# 56. Error handling

UI не должен падать из-за одного повреждённого node config.

Ошибки проекта:

- показываются локально;
- broken node можно открыть;
- raw JSON должен оставаться доступным для recovery.

---

# 57. Project Recovery

При загрузке повреждённого проекта:

- попытаться восстановить совместимые данные;
- показать список проблем;
- предложить открыть проект в recovery mode.

---

# 58. Security principles

Даже в v0.1:

- не хранить реальные API keys внутри экспортируемого workflow;
- secrets должны быть references;
- предупреждать при попытке вставить очевидный секрет;
- не выполнять arbitrary code.

---

# 59. Что сознательно НЕ входит в v0.1

Не реализуем:

- real multi-agent execution;
- LLM calls как центральную функцию;
- production scheduler;
- queue;
- workers;
- cloud orchestration;
- team collaboration;
- comments;
- permissions;
- OAuth platform;
- secrets vault;
- plugin marketplace;
- n8n-compatible runtime;
- Git integration;
- MCP runtime;
- deployment;
- monitoring;
- billing;
- mobile editor.

---

# 60. Что должно стать возможным после v0.1

Архитектура должна позволять добавить:

## v0.2

- Codex integration;
- prompt generation;
- architecture assistant;
- richer validation;
- templates;
- Git export.

## v0.3

- basic local runtime;
- tool execution;
- MCP;
- logs;
- run history.

## v0.4

- workflow debugger;
- breakpoints;
- step-by-step execution;
- variables;
- state inspection.

## v0.5+

- distributed runtime;
- schedules;
- webhooks;
- credentials;
- deployment;
- team collaboration.

---

# 61. Product identity

Рабочее название:

**Workflow Architect**

Короткое позиционирование:

> Visual engineering environment for agentic systems.

Вариант:

> Design agent systems before you build them.

Русский смысл:

> Проектируй AI-системы до того, как писать реализацию.

---

# 62. Ключевая продуктовая метафора

Workflow Architect — не «редактор блок-схем».

Он должен ощущаться как:

> **чертёжная доска для AI-систем**

Пользователь должен видеть архитектуру проекта целиком, понимать движение информации и иметь возможность постепенно углубляться внутрь каждого элемента.

---

# 63. Главный UX-сценарий

## Шаг 1

Пользователь создаёт Blank Project.

## Шаг 2

В Concept Mode набрасывает:

```text
Запрос
 ↓
Анализ
 ↓
Исследование
 ↓
Создание
 ↓
Проверка
```

## Шаг 3

Преобразует:

```text
Анализ       → Agent
Исследование → Agent
Создание     → Agent
Проверка     → Agent
```

## Шаг 4

Добавляет Tools.

## Шаг 5

Определяет связи и contracts.

## Шаг 6

Группирует элементы в Subworkflow.

## Шаг 7

Запускает Validate.

## Шаг 8

Открывает Preview.

## Шаг 9

Экспортирует Codex Package.

---

# 64. Критерий успеха UX

Новый пользователь должен суметь без инструкции:

1. создать node;
2. переименовать;
3. соединить;
4. переместить;
5. открыть Inspector;
6. добавить новый node;
7. экспортировать проект.

---

# 65. Критерий успеха продукта v0.1

v0.1 считается успешной, если пользователь может использовать Workflow Architect как основной рабочий инструмент для проектирования новой AI-системы вместо:

- бумаги;
- Miro;
- Excalidraw;
- заметок;
- разрозненных Markdown-файлов.

И при этом результат проектирования можно передать машине.

---

# 66. Definition of Done — Alpha v0.1

Alpha считается готовой, когда реализованы:

## Core

- [ ] Create project
- [ ] Open project
- [ ] Autosave
- [ ] Import
- [ ] Export

## Canvas

- [ ] Infinite Canvas
- [ ] Pan
- [ ] Zoom
- [ ] Minimap
- [ ] Selection
- [ ] Multi-selection
- [ ] Drag
- [ ] Resize
- [ ] Snap
- [ ] Undo
- [ ] Redo

## Nodes

- [ ] Concept
- [ ] Agent
- [ ] Tool
- [ ] Trigger
- [ ] Logic
- [ ] Data
- [ ] Human
- [ ] Artifact
- [ ] Subworkflow

## Graph

- [ ] Connections
- [ ] Ports
- [ ] Edge editing
- [ ] Connection labels
- [ ] Basic contracts

## Organization

- [ ] Groups
- [ ] Notes
- [ ] Search
- [ ] Alignment

## Inspector

- [ ] Node Inspector
- [ ] Edge Inspector
- [ ] Group Inspector
- [ ] Project Inspector

## Engineering

- [ ] Concept → Engineering conversion
- [ ] Agent config
- [ ] Tool config
- [ ] Schema editor
- [ ] Validation

## Export

- [ ] project.json
- [ ] workflow.json
- [ ] architecture.md
- [ ] Codex package

## Visual quality

- [ ] Dark design system
- [ ] Semantic colors
- [ ] Hover states
- [ ] Selected states
- [ ] Animations
- [ ] Status states
- [ ] Empty states
- [ ] Responsive panels
- [ ] Reduced motion

---

# 67. Приоритет разработки

## Phase 1 — Foundation

- project schema;
- state model;
- Canvas;
- nodes;
- edges;
- persistence.

## Phase 2 — Engineering semantics

- node types;
- Inspector;
- conversion;
- contracts;
- validation.

## Phase 3 — Product quality

- design system;
- animation;
- shortcuts;
- minimap;
- groups;
- search.

## Phase 4 — Export

- JSON;
- YAML;
- Markdown;
- Codex package.

## Phase 5 — Alpha polish

- demo templates;
- onboarding;
- recovery;
- performance;
- bug fixing.

---

# 68. Главные архитектурные запреты

При разработке v0.1 нельзя:

1. Привязывать внутреннюю модель напрямую к React Flow.
2. Использовать координаты Canvas как основную бизнес-модель.
3. Хранить prompts только внутри UI-state.
4. Использовать названия узлов как id.
5. Связывать export logic непосредственно с React components.
6. Делать Inspector уникальным кодом для каждого поля без schema-driven подхода.
7. Хранить API keys внутри project files.
8. Строить UI таким образом, чтобы без Canvas невозможно было прочитать project model.
9. Создавать runtime до завершения устойчивой модели проекта.
10. Делать визуальный стиль зависимым от стандартного вида UI-библиотеки.

---

# 69. Архитектурный принцип реализации

Рекомендуемое разделение:

```text
UI Layer
    ↓
Editor Commands
    ↓
Domain Model
    ↓
Project Store
    ↓
Serializer / Validator / Exporter
```

Canvas должен работать с Domain Model через адаптер.

---

# 70. Центральная модель

В перспективе любой проект должен существовать независимо от UI.

То есть:

```text
Canvas
  ⇅
Domain Graph
  ⇅
Serialized Project
  ⇅
Code / Runtime / External Tools
```

Именно этот принцип является фундаментом будущего Workflow Architect.

---

# 71. Итог v0.1

Workflow Architect v0.1 — это не production automation engine.

Это:

> **эстетичная визуальная инженерная среда для проектирования мультиагентных и AI-workflow систем с постепенной формализацией и машинным экспортом.**

Главный результат первой версии:

> Пользователь начинает с идеи на пустом Canvas и заканчивает формализованной архитектурой, которую уже может понять и продолжить реализовывать coding-agent.

Это и есть фундамент будущего продукта, который со временем может развиться в собственную среду уровня:

**Canvas + n8n + Codex + MCP + Runtime.**
