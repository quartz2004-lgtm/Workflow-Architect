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

export type EffectState = 'not-started' | 'pure' | 'confirmed' | 'unknown'
export interface RetryPolicy { maxAttempts: number; initialDelayMs: number; maxDelayMs: number }
export interface RecoveryInput {
  cancelled: boolean
  now: number
  deadline: number
  attempts: number
  effect: EffectState
  idempotencySupported: boolean
  idempotencyKey?: string
  policy: RetryPolicy
}
export type RecoveryDecision =
  | { kind: 'cancelled' | 'expired' | 'exhausted' | 'reconcile' | 'continue' }
  | { kind: 'retry'; delayMs: number; idempotencyKey?: string }

/** An unknown external effect is never treated as a failed pure calculation. */
export function recoveryDecision(input: RecoveryInput): RecoveryDecision {
  const { policy } = input
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 0 || !Number.isFinite(input.now) || !Number.isFinite(input.deadline)
    || !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 10
    || !Number.isSafeInteger(policy.initialDelayMs) || policy.initialDelayMs < 0
    || !Number.isSafeInteger(policy.maxDelayMs) || policy.maxDelayMs < policy.initialDelayMs || policy.maxDelayMs > 300000) throw new Error('Некорректная политика восстановления.')
  if (input.cancelled) return { kind: 'cancelled' }
  if (input.now >= input.deadline) return { kind: 'expired' }
  if (input.effect === 'confirmed' || input.effect === 'not-started') return { kind: 'continue' }
  if (input.effect === 'unknown' && (!input.idempotencySupported || !input.idempotencyKey?.trim())) return { kind: 'reconcile' }
  if (input.attempts >= policy.maxAttempts) return { kind: 'exhausted' }
  const delayMs = Math.min(policy.maxDelayMs, policy.initialDelayMs * 2 ** Math.min(input.attempts, 10))
  if (input.now + delayMs >= input.deadline) return { kind: 'expired' }
  return { kind: 'retry', delayMs, ...(input.effect === 'unknown' ? { idempotencyKey: input.idempotencyKey } : {}) }
}
