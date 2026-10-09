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

import { memo } from 'react'
import { SmoothStepEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

export const WorkflowEdge = memo(function WorkflowEdge(props: EdgeProps) {
  const [, x, y] = getSmoothStepPath(props)
  return <><SmoothStepEdge {...props} /><g className="edge-edit-affordance" transform={`translate(${x},${y - 21})`}><title>Редактировать связь в Inspector</title><rect x="-11" y="-10" width="22" height="20" rx="4" /><text textAnchor="middle" dominantBaseline="central">✎</text></g></>
})
