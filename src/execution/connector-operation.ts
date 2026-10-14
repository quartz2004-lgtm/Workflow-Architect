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

import type { ExecutionConfig, JsonValue } from '../domain/execution-config'
import type { ConnectorAction } from '../domain/connector-actions'
import { mapValue } from './values'

export type ConnectorExecutor = (connectionId: string, key: string, action: ConnectorAction, args: JsonValue, signal: AbortSignal) => Promise<JsonValue>
export function connectorArguments(operation: Extract<ExecutionConfig, { kind: 'connector' }>, input: JsonValue, data: ReadonlyMap<string, JsonValue>): Record<string, JsonValue> {
  return mapValue({ kind: 'map', fields: operation.fields, keepInput: false }, input, data) as Record<string, JsonValue>
}
