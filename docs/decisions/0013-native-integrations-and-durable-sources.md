# ADR 0013 — Native integrations and durable event sources

Status: implemented for the 0.5.0 release candidate, live Telegram acceptance pending.

## Decision

The domain gains a declarative `connector` operation (connection UUID, action, field mappings) and `telegram-message` / `schedule` entry operations. Project schema 0.4, plan/checkpoint 0.5 preserve older snapshots through frozen 0.3 schemas and backup-first migration. No Canvas or provider SDK types enter the domain. The executor receives a `ConnectorExecutor`; browser workers have no network/filesystem implementation.

Native connection records belong to one local profile. They contain HTTPS roots, selected filesystem directories, credential UUIDs and explicit MCP tool grants. These settings do not enter portable project JSON. `IntegrationConnections.capture` returns a revocable generation; changes stop in-flight operations using that generation. The credentials main process resolves secrets per action over a private utility/main channel unavailable to the renderer. A secret is never a public IPC return value. Known-secret and obvious-secret guards run before connector output enters a workflow, effect journal or model context.

HTTP uses HTTPS, no redirects, public IPv4 DNS pinned per request, bounded JSON responses and explicitly enabled write methods. Local files require relative portable paths beneath a selected real directory; symlinks/junctions and hard-linked reads are rejected. Regular file edits compare the previously read content hash before atomic replacement. These are application permissions, not an OS sandbox against other programs running as the same Windows user.

The MCP adapter launches only the bundled official filesystem server 1.0.0 with the selected directory. It does not run graph-supplied commands, invoke a package manager, or advertise ambient client roots. Available tools are limited to text reading, writing, listing and file metadata. Each grant pins the tool's input schema hash; contract drift requires a new grant. `write_file` may overwrite files inside the allowed folder once that tool is explicitly permitted; users who need compare-and-swap edits should use the built-in file adapter. The client is closed after each operation/discovery and on abort.

## External effects and recovery

An effect key is scoped by profile, run/activation/tool call or Telegram event/notification. A canonical fingerprint includes connection ID/revision and arguments. The journal durably registers `pending` before issuing an external write and records its result only after acknowledgement. Concurrent duplicate calls share one promise; acknowledged duplicates return the saved result. Pending or failed/unknown writes after restart are never automatically retried. This provides durable deduplication, not a claim of exactly-once delivery by Telegram or an arbitrary HTTP API.

Recovery examines interrupted checkpoint activations, not every node in the graph. A saved Human wait after a completed model call can resume without rerunning that call. Interrupted Agent, Parallel or connector actions require reconciliation; their automatic replay is forbidden. Already completed checkpoints remain authoritative.

## Telegram and scheduling

Publishing produces an immutable workflow snapshot outside the editable project. A private chat is paired through a random, one-use, ten-minute code, then bound to bot ID, user ID, chat ID, connection and profile. Unknown senders and groups are ignored. One poller per bot avoids duplicate long-poll consumers when both local profiles use the same bot. Webhooks owned by other applications are not silently removed.

Accepted updates are durably registered before the polling cursor advances. Runtime submissions use stable `telegram:bot:update` event keys. Outgoing messages/files use the effect journal. Human callbacks refer to a concrete current request and are checked against the bound sender, chat, run, mode and expiry. Natural-language classification can choose only create/edit/status/file/help; it cannot change permissions, run a shell or approve an operation. Explicit commands remain available without model classification. One active article per conversation prevents ambiguous edits; `/edit` includes the previous completed artifact as input to a new run.

Schedules persist their next due slot; the slot becomes the submission's idempotency key. After sleep, one missed run is submitted and the next future slot is persisted. This is a local interval scheduler while the app/tray runs, not a distributed or cloud service.

## Consequences and bounded scope

Telegram is the actual user-selected web service for 0.5.0; no additional publication service was selected. No Codex/VS Code integration, remote shell, OAuth platform, marketplace, arbitrary MCP launch command or group-chat management is implied. Runtime histories, incoming events and effects have hard quotas and fail closed when full; no silent expiry discards deduplication evidence. Manual reconciliation is required for unknown remote outcomes. Real two-profile bot acceptance must be recorded separately from fake-transport tests.
