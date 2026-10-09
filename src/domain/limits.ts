/** Portable snapshots use the same UTF-8 byte quota on read and write. Local saves remain lossless. */
export const portableSnapshotBytes = 64 * 1024 * 1024
export function assertPortableSnapshot(raw: string): void {
  if (new TextEncoder().encode(raw).byteLength > portableSnapshotBytes) throw new Error('Лимит переносимого JSON/YAML — 64 MiB. Локальные данные сохранены; скачайте аварийную копию JSON.')
}
