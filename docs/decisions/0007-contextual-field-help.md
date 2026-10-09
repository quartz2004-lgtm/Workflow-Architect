# 0007 — Contextual field help

Accepted: 2026-10-09.

`src/help/field-help.ts` is the shared field documentation catalog. Stable keys describe UI concepts independently of translated labels. Configuration fields resolve `nodeType.path`, then shared paths such as `input` or `execution.retries`; `ConfigField.helpKey` can override that convention. A coverage test requires documentation for every registered configuration field and verifies that every text appears in its linked almanac chapter.

Shared TextField, SelectField and JsonField use separate associated labels and help buttons. Help text does not contaminate the accessible input name or become a domain property. Contract legends, node lists and project checkboxes use the same component. A native HTML popover renders above scrolling panels and modal dialogs. Hover and keyboard focus reveal it; Escape dismisses help before closing a dialog. The almanac opens at the related chapter and returns focus to its trigger.

The catalog also contributes field tables to the full almanac and its offline HTML export. `uiStore.helpChapter` is temporary navigation state. The serializer, schema, Canvas adapter, history and autosave format are unchanged. Explicit `.ts` imports in documentation data permit the existing Node 24 documentation generator to share the source with Vite; TypeScript remains no-emit.
