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

import type { JsonValue } from '../domain/execution-config'
import type { AgentTrace } from '../ai/agent'
import type { ContextPacket } from '../knowledge/context'
import type { EditorialState } from '../editorial/engine-schema'
import type { EditorialVersion } from '../editorial/schema'

export type RunStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
export interface Activation { id: string; callId: string; graphId: string | null; nodeId: string; path: string[] }
export interface RunArtifact { id: string; activation: Activation; filename: string; format: 'json' | 'text'; content: string }
export interface HumanRequest { id: string; activation: Activation; question: string; mode: 'approval' | 'input'; expiresAt: string; editorial?: EditorialVersion }
export type RunEventPayload =
  | { kind: 'editorial'; activation: Activation; state: EditorialState }
  | { kind: 'knowledge'; activation: Activation; packet: ContextPacket }
  | { kind: 'ai'; activation: Activation; trace: AgentTrace }
  | { kind: 'status'; status: RunStatus }
  | { kind: 'step-start'; activation: Activation; input: JsonValue; data: Record<string, JsonValue> }
  | { kind: 'step-finish'; activation: Activation; output: JsonValue; ports: Record<string, JsonValue> }
  | { kind: 'human-request'; request: HumanRequest }
  | { kind: 'human-answer'; requestId: string; value: JsonValue }
  | { kind: 'artifact'; artifact: RunArtifact }
  | { kind: 'failure'; activation?: Activation; message: string }
export type RunEvent = RunEventPayload & { runId: string; sequence: number; timestamp: string }
export interface RunOutcome { runId: string; planId: string; status: RunStatus; steps: number; artifacts: RunArtifact[]; error?: { activation?: Activation; message: string } }
