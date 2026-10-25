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

import { z } from 'zod'

/** Native import decodes, resizes and strips metadata before constructing this payload. */
export const modelImageSchema = z.strictObject({
  data: z.string().min(16).max(700000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .refine(value => value.startsWith('iVBORw0KGgo') || value.startsWith('/9j/'), 'Ожидаются байты PNG или JPEG, не путь или URL.'),
  width: z.number().int().min(1).max(768), height: z.number().int().min(1).max(768),
})
export const modelImagesSchema = z.array(modelImageSchema).max(2)
export type ModelImage = z.infer<typeof modelImageSchema>

/** Conservative patch reserve for bounded local images; actual usage is also enforced after inference. */
export function imageContextReserve(images: readonly ModelImage[]): number {
  return images.reduce((sum, image) => sum + Math.ceil(image.width / 14) * Math.ceil(image.height / 14) + 1024, 0)
}
