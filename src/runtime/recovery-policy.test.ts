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
import { recoveryDecision, type RecoveryInput } from './recovery-policy'

const base: RecoveryInput = { cancelled: false, now: 100, deadline: 10000, attempts: 1, effect: 'pure', idempotencySupported: false, policy: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 1000 } }
describe('recovery safety policy', () => {
  it('never retries a cancelled operation or lets confirmed results bypass cancellation', () => {
    for (const effect of ['pure', 'unknown', 'confirmed', 'not-started'] as const) expect(recoveryDecision({ ...base, effect, cancelled: true })).toEqual({ kind: 'cancelled' })
  })
  it('requires reconciliation of an unknown external effect unless the adapter supports the original idempotency key', () => {
    expect(recoveryDecision({ ...base, effect: 'unknown' })).toEqual({ kind: 'reconcile' })
    expect(recoveryDecision({ ...base, effect: 'unknown', idempotencySupported: true })).toEqual({ kind: 'reconcile' })
    expect(recoveryDecision({ ...base, effect: 'unknown', idempotencyKey: 'original' })).toEqual({ kind: 'reconcile' })
    expect(recoveryDecision({ ...base, effect: 'unknown', idempotencyKey: 'original', idempotencySupported: true })).toEqual({ kind: 'retry', delayMs: 200, idempotencyKey: 'original' })
  })
  it('caps attempts, backoff and elapsed wall time including sleep', () => {
    expect(recoveryDecision({ ...base, attempts: 3 })).toEqual({ kind: 'exhausted' })
    expect(recoveryDecision({ ...base, attempts: 8, policy: { ...base.policy, maxAttempts: 10 } })).toEqual({ kind: 'retry', delayMs: 1000 })
    expect(recoveryDecision({ ...base, now: 11000 })).toEqual({ kind: 'expired' })
    expect(recoveryDecision({ ...base, deadline: 300 })).toEqual({ kind: 'expired' })
    expect(() => recoveryDecision({ ...base, attempts: -1 })).toThrow()
  })
  it('continues from a confirmed checkpoint without repeating the completed effect', () => {
    expect(recoveryDecision({ ...base, effect: 'confirmed' })).toEqual({ kind: 'continue' })
    expect(recoveryDecision({ ...base, effect: 'not-started' })).toEqual({ kind: 'continue' })
  })
})
