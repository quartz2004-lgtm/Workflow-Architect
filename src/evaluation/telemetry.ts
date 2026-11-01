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

import { execFile } from 'node:child_process'
import { cpus, freemem, platform, release, totalmem } from 'node:os'
import { promisify } from 'node:util'
import { z } from 'zod'

const execute = promisify(execFile)
const finite = z.number().finite().nonnegative()
const gpuSchema = z.strictObject({ index: finite.int(), usedMiB: finite, totalMiB: finite.positive(), utilizationPercent: finite.max(100) })
export function parseGpuMetrics(text: string) {
  if (!text.trim()) throw new Error('Empty GPU report')
  return text.trim().split(/\r?\n/).map(line => {
    const fields = line.split(',').map(value => value.trim())
    if (fields.length !== 4 || fields.some(value => !/^\d+(?:\.\d+)?$/.test(value))) throw new Error('Unavailable GPU metric')
    const [index, usedMiB, totalMiB, utilizationPercent] = fields.map(Number)
    const gpu = gpuSchema.parse({ index, usedMiB, totalMiB, utilizationPercent })
    if (gpu.usedMiB > gpu.totalMiB) throw new Error('Invalid GPU memory report')
    return gpu
  })
}
const modelsSchema = z.object({ models: z.array(z.object({
  name: z.string(), digest: z.string(), size: finite, size_vram: finite,
  context_length: finite.int().optional(), details: z.object({ parameter_size: z.string().optional(), quantization_level: z.string().optional() }).optional(),
})) })

/** Fixed local endpoints/commands only. Missing telemetry stays unknown, never zero. */
export async function captureLocalEnvironment() {
  const startedAt = new Date().toISOString()
  const [gpu, ollama] = await Promise.allSettled([
    execute('nvidia-smi', ['--query-gpu=index,memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'], { timeout: 3000, maxBuffer: 16384, windowsHide: true }).then(value => parseGpuMetrics(value.stdout)),
    fetch('http://127.0.0.1:11434/api/ps', { signal: AbortSignal.timeout(3000), redirect: 'error' }).then(async response => {
      if (!response.ok) throw new Error('Ollama telemetry unavailable')
      return modelsSchema.parse(await response.json()).models
    }),
  ])
  return {
    startedAt, completedAt: new Date().toISOString(),
    cpu: cpus()[0]?.model ?? null, logicalCores: cpus().length,
    ramTotalBytes: totalmem(), ramFreeBytes: freemem(), platform: platform(), release: release(),
    gpu: gpu.status === 'fulfilled' ? { available: true as const, devices: gpu.value } : { available: false as const },
    ollama: ollama.status === 'fulfilled' ? { available: true as const, models: ollama.value } : { available: false as const },
  }
}
