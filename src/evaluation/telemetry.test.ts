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

import { describe, expect, it } from 'vitest'
import { parseGpuMetrics } from './telemetry'

describe('local GPU evidence', () => {
  it('keeps each GPU and does not confuse utilization with allocated VRAM', () => {
    expect(parseGpuMetrics('0, 11219, 12227, 18\r\n1, 0, 8192, 0\r\n')).toEqual([
      { index: 0, usedMiB: 11219, totalMiB: 12227, utilizationPercent: 18 },
      { index: 1, usedMiB: 0, totalMiB: 8192, utilizationPercent: 0 },
    ])
  })
  it.each(['', '0, N/A, 12227, 18', '0, 12, 10, 2', '0, 1, 10, 101', '0, 1, 10', '0, , 10, 1'])('rejects unavailable or impossible readings: %s', value => {
    expect(() => parseGpuMetrics(value)).toThrow()
  })
})
