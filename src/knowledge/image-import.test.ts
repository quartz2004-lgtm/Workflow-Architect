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

import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ nativeImage: {} }))
import { imageDimensions } from './image-import'

function png(width: number, height: number) {
  const bytes = Buffer.alloc(45)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20)
  bytes.write('IEND', 37)
  return bytes
}
describe('pre-decode image limits', () => {
  it('reads bounded PNG and JPEG dimensions without decoding their pixels', () => {
    expect(imageDimensions(png(640, 480))).toEqual({ width: 640, height: 480 })
    const jpeg = Buffer.from([255, 216, 255, 192, 0, 8, 8, 1, 224, 2, 128, 1])
    expect(imageDimensions(jpeg)).toEqual({ width: 640, height: 480 })
  })
  it('rejects decompression bombs, fake formats, truncation and animation before a native decoder can run', () => {
    for (const dimensions of [[0, 1], [65535, 1], [8192, 8192], [4001, 4000]]) expect(() => imageDimensions(png(dimensions[0]!, dimensions[1]!))).toThrow('Размер')
    expect(() => imageDimensions(Buffer.from('<svg>not PNG</svg>'))).toThrow('JPEG')
    const animated = png(20, 20); animated.write('acTL', 37)
    expect(() => imageDimensions(animated)).toThrow('Анимированные')
    const broken = png(20, 20); broken.writeUInt32BE(999999, 33)
    expect(() => imageDimensions(broken)).toThrow('Повреждённый')
    expect(() => imageDimensions(Buffer.from([255, 216, 255, 192, 0, 200]))).toThrow('Повреждённый')
  })
})
