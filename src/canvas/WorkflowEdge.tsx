import { memo } from 'react'
import { SmoothStepEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

export const WorkflowEdge = memo(function WorkflowEdge(props: EdgeProps) {
  const [, x, y] = getSmoothStepPath(props)
  return <><SmoothStepEdge {...props} /><g className="edge-edit-affordance" transform={`translate(${x},${y - 21})`}><title>Редактировать связь в Inspector</title><rect x="-11" y="-10" width="22" height="20" rx="4" /><text textAnchor="middle" dominantBaseline="central">✎</text></g></>
})
