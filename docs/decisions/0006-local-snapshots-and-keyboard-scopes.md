# 0006 — Local snapshots and keyboard scopes

Accepted: 2026-10-09.

Local IndexedDB snapshots must reopen whenever serialization and storage succeeded. The external 10 MiB import quota must not classify a valid local snapshot as damaged. `deserializeStoredProject` parses JSON and runs the same strict version, credential and runtime-schema checks without the external byte quota. Boot, project selection and repository listing use this boundary. External JSON/YAML/ZIP imports retain their existing size and archive expansion limits. This also recovers already saved oversized valid snapshots without migrating data.

Large local snapshots can be exported for backup, but importing files above the external quota remains unsupported. This is an explicit portability limitation, not a guarantee of unlimited memory or storage. Streaming imports and large-project performance are separate work. Damaged oversized snapshots still exceed the best-effort recovery quota; their original bytes remain available for download.

Letter shortcuts use physical `KeyboardEvent.code`, with `key` fallback for events without a physical letter code. Text editing retains native copy/paste/select/undo. Search and command palette are available from text fields; modal dialogs keep their own keyboard scope. Composition, Alt/AltGraph and repeating events never trigger graph commands. Duplicate derives from the current selection and does not replace the internal copy buffer.

Project schema remains 0.1. No Canvas or persistence types enter the domain.
