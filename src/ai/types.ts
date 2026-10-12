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

export interface ModelToolCall { name: string; arguments: Record<string, JsonValue> }
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ModelToolCall[]
  toolName?: string
}
export interface ModelTool { name: string; description: string; parameters: Record<string, JsonValue> }
export interface ModelRequest {
  model: string
  messages: ModelMessage[]
  tools: ModelTool[]
  outputSchema?: Record<string, JsonValue>
  maxOutputTokens: number
  contextTokens: number
  temperature: number
}
export interface ModelResponse {
  content: string
  toolCalls: ModelToolCall[]
  inputTokens: number
  outputTokens: number
  finish: 'stop' | 'length'
}
export interface ModelCapabilities { tools: boolean; thinking: boolean; contextTokens: number }
export interface ModelProvider {
  readonly id: string
  readonly costPerMillionInput: number
  readonly costPerMillionOutput: number
  list(signal: AbortSignal): Promise<string[]>
  inspect(model: string, signal: AbortSignal): Promise<ModelCapabilities>
  chat(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse>
}
