# AGENTS.md

## Purpose

This file defines the standing instructions for coding agents working in the **Workflow Architect** repository.

The authoritative product specification is:

`docs/Workflow_Architect_v0.1_Specification.md`

Read that specification before making substantial product, architecture, data-model, Canvas, export, or UX changes.

This repository is for **Workflow Architect v0.1**: an aesthetic visual engineering environment for designing multi-agent and AI workflow systems with progressive formalization and machine-readable export.

---

# 1. Source of truth

Use the following priority order when requirements conflict:

1. Explicit instructions from the current task.
2. `docs/Workflow_Architect_v0.1_Specification.md`
3. This `AGENTS.md`
4. `docs/ARCHITECTURE.md`
5. Existing implementation details.

Do not silently override a higher-priority requirement because the current code is easier to preserve.

If the implementation and the specification diverge, prefer correcting the implementation unless the current task explicitly changes the product decision.

---

# 2. Product boundary for v0.1

Workflow Architect v0.1 is primarily a **design and engineering environment**, not a production automation runtime.

The required product path is:

**Idea → Concept Graph → Engineering Graph → Specification → Export**

Do not expand v0.1 into features intentionally reserved for later versions unless explicitly requested.

Do not proactively build:

- production multi-agent execution;
- distributed workers;
- task queues;
- production scheduler;
- cloud orchestration;
- team collaboration;
- comments or permissions;
- OAuth platform;
- secrets vault;
- plugin marketplace;
- deployment infrastructure;
- billing;
- production observability;
- n8n-compatible runtime;
- arbitrary-code execution.

A lightweight visual execution preview or graph simulation is allowed only where the specification requires it.

---

# 3. Core architectural principle

Preserve this separation:

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

The long-term product model is:

```text
Canvas
  ⇅
Domain Graph
  ⇅
Serialized Project
  ⇅
Code / Runtime / External Tools
```

The Canvas is a human interface.

The serialized domain model is the durable representation of the project.

Do not make the Canvas library the source of truth.

---

# 4. Canvas isolation

If XYFlow / React Flow is used:

- do not expose XYFlow types throughout the domain layer;
- do not persist raw XYFlow objects as the project format;
- do not make export logic depend on XYFlow;
- do not make validation depend on rendered components;
- do not treat visual coordinates as business semantics.

Create an adapter between the Canvas implementation and the domain graph.

It must be possible in the future to replace the Canvas library without rewriting the domain model, project serializer, validator, or exporters.

---

# 5. Domain model rules

Persistent entities must use stable IDs.

Never use a user-editable name as a primary key.

Persistent entities include at minimum:

- projects;
- nodes;
- edges;
- groups;
- schemas;
- subworkflows;
- prompts or prompt references where applicable.

Prefer stable generated IDs such as UUID/ULID-style identifiers.

All serialized project formats must include a version field:

```json
{
  "schemaVersion": "0.1"
}
```

Design data structures with future migrations in mind.

Do not introduce silent breaking changes to the serialized project format.

---

# 6. Progressive formalization

The product must support moving from vague ideas to formal engineering structures.

A Concept Node must remain lightweight.

Do not require technical configuration merely to create or connect a Concept Node.

Concept Nodes may later be converted to:

- Agent;
- Tool;
- Trigger;
- Logic;
- Data;
- Human;
- Artifact;
- Subworkflow.

Conversion must preserve as much user work as reasonably possible:

- position;
- size;
- title;
- description;
- notes;
- color;
- existing connections.

Conversion must remain undoable through the editor history.

---

# 7. Node semantics

Keep semantic node types distinct from their visual presentation.

Supported engineering types for v0.1:

- Agent;
- Tool;
- Trigger;
- Logic;
- Data;
- Human;
- Artifact;
- Subworkflow.

Also support non-executable editor entities such as:

- Concept Node;
- Note;
- Group.

Do not encode product semantics only through colors or component names.

---

# 8. Connections are domain entities

Edges are not decorative lines.

A connection may contain:

- stable id;
- source node;
- source port;
- target node;
- target port;
- type;
- label;
- contract;
- condition;
- metadata.

Supported connection semantics for v0.1 should remain compatible with:

- Flow;
- Data;
- Tool access;
- Reference.

Do not hard-code the entire graph model around a single generic edge type.

---

# 9. Inspector architecture

Prefer a schema-driven or configuration-driven Inspector architecture.

Avoid building every node inspector as an unrelated one-off form.

Shared concepts should reuse shared controls:

- identity;
- description;
- tags;
- schemas;
- execution metadata;
- references;
- tool lists;
- prompt editing.

The Inspector should be extensible without turning into a large conditional component.

---

# 10. State management

Avoid a monolithic application store.

Prefer separation similar to:

```text
projectStore
canvasStore
selectionStore
historyStore
uiStore
validationStore
exportStore
```

Exact names may differ, but responsibilities must remain separated.

Do not mix temporary UI state with persistent project data unless there is a clear reason.

Examples of temporary UI state:

- open dialogs;
- hovered node;
- panel width;
- current viewport;
- command palette query.

Examples of persistent project data:

- nodes;
- edges;
- groups;
- node configuration;
- schemas;
- project metadata.

---

# 11. Editor commands and history

User-visible editing operations should go through predictable editor commands or an equivalent abstraction.

Undo/redo must be designed from the beginning, not retrofitted later.

History should support at minimum:

- create node;
- delete node;
- move node;
- resize node;
- create edge;
- delete edge;
- edit node;
- edit edge;
- group;
- ungroup;
- convert node;
- style changes that are part of the project.

Prefer command/patch-based history over duplicating the entire application state for every small interaction where practical.

Do not record transient hover or viewport animation state in undo history.

---

# 12. Persistence

v0.1 is local-first.

The application must not require a cloud account for basic use.

Preferred persistence direction:

- IndexedDB for local project persistence;
- project import/export for portability;
- future cloud synchronization as a separate concern.

Autosave must not block interaction.

Persisted data must be serializable independently of React component state.

---

# 13. Import, export, and serialization

Export logic must be independent from the UI component tree.

The project should be able to export machine-readable structures including:

- `project.json`;
- `workflow.json`;
- agent configuration files;
- prompt files;
- tool configuration;
- shared schemas;
- Markdown architecture documentation;
- Codex implementation package.

Keep exporters modular.

Do not build a single giant export function containing all formats.

When adding a new export target, prefer a dedicated exporter consuming the domain model.

---

# 14. Validation

Validation belongs to the domain/application layer, not to rendered UI components.

The validator should be capable of detecting issues such as:

- orphan nodes;
- invalid connections;
- broken references;
- duplicate IDs;
- missing required engineering fields;
- missing contracts where required;
- empty Subworkflows;
- unresolved Concept Nodes before engineering export.

Use severity levels compatible with:

- error;
- warning;
- note/info.

Warnings should not normally block raw project export.

---

# 15. Secrets and security

Never store real API keys, access tokens, passwords, private keys, or equivalent credentials inside exportable project JSON.

Project files may store secret references, placeholders, environment-variable names, or credential identifiers.

Do not implement arbitrary code execution in v0.1.

Treat imported project data as untrusted input.

Validate and sanitize imported structures before using them.

---

# 16. Design quality is a product requirement

Workflow Architect v0.1 must not look like an unstyled prototype.

Visual quality is part of the Definition of Done.

The target style is:

- dark engineering UI;
- precise;
- calm;
- premium;
- modern;
- slightly futuristic;
- visually restrained.

Avoid:

- excessive neon;
- oversaturated gradients;
- giant blur effects;
- generic AI-purple everywhere;
- default component-library appearance;
- dashboard-like visual clutter.

Do not ship raw default shadcn/Radix styling as the product identity.

UI primitives may be used, but they must be adapted to the Workflow Architect visual system.

---

# 17. Semantic color system

Use color primarily as semantic accent, not as large surface fill.

Initial semantic direction:

- Agent → violet;
- Tool → cyan;
- Trigger → emerald;
- Logic → amber;
- Data → blue;
- Human → rose;
- Artifact → indigo;
- Subworkflow → slate / restrained gradient;
- Concept → neutral.

Prefer applying semantic color to:

- accent borders;
- icon containers;
- ports;
- selected rings;
- status indicators;
- restrained glow.

Keep primary node surfaces neutral and dark.

Never communicate important state by color alone.

---

# 18. Motion

Motion must provide feedback and spatial continuity.

Typical UI transitions should remain approximately within 120–220 ms unless there is a reason otherwise.

Good uses:

- node creation;
- selection;
- panel transitions;
- connection creation;
- status transitions;
- execution preview pulses.

Avoid decorative continuous animation.

Support reduced motion.

Performance takes priority over ornamental effects.

---

# 19. Canvas UX expectations

Canvas interactions should feel immediate.

Required interaction quality includes:

- smooth pan;
- smooth zoom;
- reliable drag;
- selection rectangle;
- multi-selection;
- snapping;
- alignment guides;
- predictable connection behavior;
- keyboard shortcuts;
- minimap;
- fit project;
- fit selection where implemented.

Avoid interaction patterns that require unnecessary modal dialogs for simple editing.

---

# 20. Zoom-aware rendering

Do not render all node detail at every zoom level.

The UI should be capable of reducing visual complexity when zoomed out.

At distant zoom:

- preserve title;
- type;
- status;
- graph structure.

At normal zoom:

- show the standard node card.

At close zoom:

- optionally reveal technical metadata.

This behavior should be implemented in a way that remains performant.

---

# 21. Accessibility

Maintain:

- visible focus states;
- keyboard accessibility;
- sufficient text contrast;
- reduced-motion compatibility;
- non-color-only status communication;
- readable labels and controls.

Do not sacrifice basic accessibility for visual effects.

---

# 22. Performance targets

Optimize for a smooth graph editing experience.

Target expectations from the v0.1 specification:

- around 100 nodes should feel fully smooth;
- around 300 nodes should remain usable;
- dragging should not trigger expensive global rerenders;
- autosave must not block the main interaction loop;
- Inspector edits should not rerender the whole Canvas unnecessarily.

Profile before introducing complicated optimization abstractions, but avoid obvious architectural performance traps.

---

# 23. Component boundaries

Prefer small, composable components with clear responsibilities.

Avoid giant files combining:

- domain logic;
- persistence;
- Canvas rendering;
- Inspector forms;
- export logic;
- validation.

When a file becomes responsible for several independent concerns, split it.

Do not over-fragment trivial components merely to reduce line count.

---

# 24. TypeScript rules

Use TypeScript strictly.

Avoid `any` unless interfacing with an unavoidable external boundary and isolate it locally.

Prefer:

- discriminated unions for node types;
- explicit domain types;
- validated external input;
- schema inference where useful.

Do not allow library-specific types to leak into unrelated layers.

---

# 25. Runtime validation

Use runtime schema validation for imported and persisted project data.

Zod is the preferred direction from the product specification unless the repository establishes an alternative.

Static TypeScript types are not enough for imported files.

Validation schemas should be reusable for:

- import;
- migration;
- persistence boundaries;
- export verification where appropriate.

---

# 26. Styling architecture

Prefer shared design tokens for:

- colors;
- surfaces;
- borders;
- radii;
- shadows;
- spacing;
- typography;
- motion;
- z-index layers.

Do not scatter arbitrary hexadecimal colors throughout individual components.

Use CSS variables or an equivalent token system.

Semantic node colors should be represented as tokens.

---

# 27. UI library usage

Radix UI, shadcn-like primitives, or equivalent libraries may be used for accessibility and interaction primitives.

However:

- do not let the library define the visual identity;
- do not copy a complete dashboard theme;
- customize spacing, surfaces, borders, states, and motion;
- maintain consistency with the Workflow Architect design language.

---

# 28. Canvas library usage

XYFlow / React Flow is the preferred Canvas direction from the specification.

Treat it as an implementation dependency, not as the product architecture.

Wrap library-specific behavior where doing so protects the domain model.

---

# 29. Recommended repository boundaries

Exact structure may evolve, but preserve clear separation comparable to:

```text
src/
  app/
  domain/
  editor/
  canvas/
  inspector/
  persistence/
  validation/
  export/
  design-system/
  shared/
```

Possible responsibility model:

- `domain/` — durable project types and semantics;
- `editor/` — commands, history, selection operations;
- `canvas/` — XYFlow adapter and visual graph rendering;
- `inspector/` — property editing UI;
- `persistence/` — IndexedDB and project loading/saving;
- `validation/` — domain validation;
- `export/` — serializers and export targets;
- `design-system/` — tokens and reusable UI primitives.

Do not treat this example as an immutable folder mandate if a better structure emerges, but preserve its architectural separation.

---

# 30. Documentation responsibilities

Maintain:

- `README.md` for setup and project-level orientation;
- this `AGENTS.md` for standing coding-agent rules;
- `docs/Workflow_Architect_v0.1_Specification.md` for product requirements;
- `docs/ARCHITECTURE.md` for the actual implemented architecture.

When a substantial architectural decision changes:

- update `docs/ARCHITECTURE.md`;
- add a short ADR under `docs/decisions/` when the decision is important and non-obvious.

Do not rewrite the product specification merely to describe implementation choices.

---

# 31. Architecture decisions

When choosing between two approaches, prefer the one that preserves future compatibility with:

- Codex integration;
- MCP tools;
- Git integration;
- local runtime;
- workflow debugging;
- execution history;
- future cloud sync.

Do not prematurely build those systems.

Preserve extension points without implementing speculative infrastructure.

---

# 32. Scope discipline

Do not add unrelated features because they are easy.

Do not convert alpha development into a generic workflow platform.

Before adding a major capability, ask:

1. Is it required by v0.1?
2. Does it directly support the core design workflow?
3. Does it preserve the product architecture?
4. Can it be implemented without dragging in future runtime complexity?

If not, defer it.

---

# 33. Implementation order

Unless a task explicitly requires otherwise, prefer this sequence:

## Foundation

1. project bootstrap;
2. domain schemas;
3. serialization model;
4. state boundaries;
5. editor command/history model.

## Canvas

6. graph adapter;
7. nodes;
8. edges;
9. selection;
10. groups;
11. minimap and navigation.

## Engineering semantics

12. typed nodes;
13. Inspector;
14. Concept → Engineering conversion;
15. contracts;
16. validation.

## Product quality

17. design tokens;
18. polished node states;
19. keyboard commands;
20. motion;
21. empty states;
22. accessibility.

## Export

23. project export;
24. Markdown architecture;
25. Codex package.

Do not build polished export flows on top of an unstable domain model.

---

# 34. Working style for coding agents

Before a substantial implementation:

1. Read the relevant specification sections.
2. Inspect existing repository architecture.
3. Identify affected domain boundaries.
4. Make the smallest coherent architectural change.
5. Implement.
6. Run relevant verification.
7. Update architecture documentation if needed.

Do not make broad speculative rewrites when a focused change is sufficient.

Do not hide architectural shortcuts behind TODO comments if they would violate a stated constraint.

---

# 35. Verification

After meaningful changes, run the repository's available verification commands.

Detect the package manager and commands from the repository rather than inventing alternatives.

At minimum, where available:

- typecheck;
- lint;
- tests relevant to the change;
- production build.

For domain changes, add or update tests for:

- serialization;
- validation;
- migrations/version handling where applicable;
- editor commands/history where appropriate.

For important UI interactions, add tests where the repository's testing stack reasonably supports them.

---

# 36. Before declaring a task complete

Check:

- Does it satisfy the requested behavior?
- Does it match the product specification?
- Did any domain type accidentally become Canvas-library-specific?
- Is persisted state serializable?
- Are new IDs stable?
- Does undo/redo still behave correctly?
- Does autosave still work?
- Does the UI match the design language?
- Are hover, focus, selected, disabled, and error states considered?
- Are typecheck/build/tests passing?
- Does documentation need updating?

Do not mark work complete while knowingly leaving the project in a broken build state unless the task explicitly concerns an intermediate incomplete branch and the limitation is clearly reported.

---

# 37. Important anti-patterns

Do not:

- persist React components or functions;
- serialize UI-only state into the core project format without reason;
- use node titles as identifiers;
- store secrets inside project files;
- make exporters depend on mounted components;
- duplicate domain logic across Inspector and Canvas;
- duplicate validation rules in multiple UI components;
- put the entire app in one Zustand store;
- couple domain schemas directly to XYFlow;
- implement future runtime infrastructure prematurely;
- sacrifice visual quality because the build is labeled alpha;
- add decorative animations that reduce usability;
- silently change the project schema without versioning.

---

# 38. Design-review rule

A feature is not finished merely because it technically works.

For visible UI changes, review at least:

- composition;
- spacing;
- hierarchy;
- semantic color;
- hover state;
- selected state;
- keyboard/focus state;
- empty/error state;
- motion;
- behavior at different zoom levels where relevant.

The alpha should feel intentional and cohesive.

---

# 39. Long-term compatibility goal

v0.1 should establish a foundation that can later support:

```text
Visual Design
      ↓
Formal Architecture
      ↓
Machine Specification
      ↓
Codex / Coding Agent
      ↓
Runtime
      ↓
Debugging / Observability
```

Future capability must be enabled by a durable domain model, not by embedding future systems into v0.1 prematurely.

---

# 40. Final principle

When implementation convenience conflicts with the long-term integrity of the project, prefer the architecture that keeps this promise true:

> **The same workflow can be understood visually by a human, structurally by the editor, and mechanically by another system.**

That is the core design constraint of Workflow Architect.

---

# 41. Copyright notice in every script

Every new or changed project-owned script/source file must begin with the exact copyright and GPL-3.0-or-later notice in `docs/COPYRIGHT_NOTICE.txt`, formatted as a comment for its language. Keep a required shebang or HTML doctype first, then the notice. This applies to TypeScript/JavaScript, tests, build scripts, CSS, HTML and executable automation/configuration YAML, PowerShell, Python and shell scripts. JSON cannot contain comments; use package metadata and LICENSE.txt instead.

Run `npm run copyright:check` before declaring a change complete. `npm run copyright:fix` adds missing headers to project-owned files, including new untracked files outside ignored output directories. Generators must preserve the header on their generated project code. Do not replace third-party copyright notices or attribute vendored third-party code to quartz2004. Dependency licenses remain in THIRD_PARTY_NOTICES.md and their original license files.
