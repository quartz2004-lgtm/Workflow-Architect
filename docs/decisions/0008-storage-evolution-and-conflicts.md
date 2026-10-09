# 0008 — Storage evolution and concurrent editing

Accepted for 0.2.0, 2026-10-09.

Project writes compare the current IndexedDB snapshot with the editor repository's observed base inside the same readwrite transaction. A stale writer fails without writing either the project or active-project preference. Listing and repeated reads cannot silently reset an existing base. Switching first flushes the previous editor, then adopts the incoming snapshot only if it still matches storage. This is optimistic concurrency control; no advisory-only browser lock is relied on.

On conflict, the graph/history stay in memory. Save-as-copy persists a new project ID before switching the editor, preserves the latest other-window snapshot, and refuses to replace the current editor if new edits arrived during the copy write. Storage quota failures leave the original session available for emergency export.

Portable JSON/YAML and compressed ZIP now have a 64 MiB quota; expanded packages and canonical multi-file input have a 128 MiB quota and at most 2000 entries. Writers and readers share checks. Local serialization remains uncapped so already saved work can reopen. Non-portable data can be downloaded explicitly as an emergency JSON backup; the UI does not promise ordinary reimport above the quota. ZIP streaming limits remain enforced even when archive headers lie.

The durable schema remains 0.1. Fixed minimal and agent/resource fixtures record compatibility. The migration pipeline rejects unknown/ambiguous/cyclic routes, validates the source and commits a byte-exact backup before any transform. The backup database is separate from project storage. Invalid output or backup failure never replaces the original. There are deliberately no invented production migrations: future real format transitions must register their source validators and transforms with tests. Boot and project opening use this pipeline; current snapshots take the unchanged validated path. Stored backup downloads are exposed in the project manager.

Verification covers concurrent repository instances, two browser windows, preservation of both conflicting versions, adoption races, portable large snapshots/ZIP, oversized export rejection, fixed 0.1 fixtures, failed backup and failed migration output.
