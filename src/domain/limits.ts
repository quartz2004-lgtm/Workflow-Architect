/*
Copyright (C) 2026  quartz2004

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://gnu.org>.
*/

/** Portable snapshots use the same UTF-8 byte quota on read and write. Local saves remain lossless. */
export const portableSnapshotBytes = 64 * 1024 * 1024
export function assertPortableSnapshot(raw: string): void {
  if (new TextEncoder().encode(raw).byteLength > portableSnapshotBytes) throw new Error('Лимит переносимого JSON/YAML — 64 MiB. Локальные данные сохранены; скачайте аварийную копию JSON.')
}
