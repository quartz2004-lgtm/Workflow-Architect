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

import { editorialApprovalSchema, editorialVersionSchema, type EditorialApproval, type EditorialVersion } from './schema'

/** Hash exact bytes: whitespace and punctuation edits also require renewed approval. */
export async function editorialDigest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function createEditorialVersion(value: Omit<EditorialVersion, 'digest'>): Promise<EditorialVersion> {
  return editorialVersionSchema.parse({ ...value, digest: await editorialDigest(value.text) })
}

export async function approveEditorialVersion(raw: EditorialVersion, expected: { taskId: string; versionId: string; digest: string }, approvedAt: string): Promise<EditorialApproval> {
  const version = editorialVersionSchema.parse(raw)
  if (version.taskId !== expected.taskId || version.id !== expected.versionId || version.digest !== expected.digest || await editorialDigest(version.text) !== version.digest) throw new Error('Текст или версия изменились. Откройте актуальный результат и подтвердите его заново.')
  if (version.finish === 'length' || version.issues.length) throw new Error('Требуется редактура. Исправьте замечания и проверьте новую версию перед подтверждением.')
  return editorialApprovalSchema.parse({ ...expected, approvedAt })
}

export async function isEditorialApprovalCurrent(version: EditorialVersion, approval: EditorialApproval | undefined): Promise<boolean> {
  if (!approval) return false
  try {
    await approveEditorialVersion(version, approval, approval.approvedAt)
    return true
  } catch { return false }
}
