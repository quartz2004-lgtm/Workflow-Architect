import type { NodeType } from '../domain/schema'

export const nodeAccent: Record<NodeType, string> = {
  concept: 'neutral', note: 'neutral', agent: 'violet', tool: 'cyan', trigger: 'emerald',
  logic: 'amber', data: 'blue', human: 'rose', artifact: 'indigo', subworkflow: 'slate',
}
